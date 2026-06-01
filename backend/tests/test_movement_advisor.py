"""Tests for the movement & route advisor (Wave 6 Feature 4: movement-route-advisor)."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings
from app.db import get_session
from app.domain.route import RouteMetric, RouteOption
from app.domain.supply import FuelDepot
from app.domain.tile import (
    Cover,
    IntelLevel,
    RoadCondition,
    TerrainType,
    Tile,
    Weather,
)
from app.domain.unit_instance import InstanceStatus, UnitInstance
from app.main import create_app
from app.providers.factory import build_unit_provider
from app.services.instance_seed import seed_unit_instances
from app.services.movement_advisor import rank_routes, reposition_suggestions


def _opt(label: str, metric: RouteMetric, threat: int, dur: float, sufficient: bool) -> RouteOption:
    return RouteOption(
        label=label,
        metric=metric,
        geometry=[[11.8, 49.2], [11.81, 49.21]],
        distance_m=5000,
        duration_s=dur,
        threat_max=threat,
        threat_avg=float(threat),
        fuel_consumed_l=100,
        fuel_remaining_l=900 if sufficient else 0,
        sufficient_fuel=sufficient,
    )


class TestRankRoutes:
    def test_safer_sufficient_route_ranks_first(self) -> None:
        fast = _opt("fastest", RouteMetric.FAST, threat=4, dur=600, sufficient=True)
        safe = _opt("safest", RouteMetric.SAFE, threat=1, dur=900, sufficient=True)
        ranked = rank_routes([fast, safe])
        assert ranked[0][0].metric is RouteMetric.SAFE  # lower threat wins despite longer time

    def test_insufficient_fuel_ranked_last(self) -> None:
        ok = _opt("safest", RouteMetric.SAFE, threat=2, dur=1200, sufficient=True)
        dry = _opt("fastest", RouteMetric.FAST, threat=0, dur=300, sufficient=False)
        ranked = rank_routes([dry, ok])
        assert ranked[0][0].sufficient_fuel is True
        assert ranked[-1][0].sufficient_fuel is False
        assert "INSUFFICIENT" in ranked[-1][2].upper()


def _tile(h3: str, lat: float, lon: float, threat: int) -> Tile:
    return Tile(
        h3_index=h3,
        resolution=8,
        center_lat=lat,
        center_lon=lon,
        terrain=TerrainType.OPEN,
        threat_level=threat,
        intel_level=IntelLevel.LOW,
        weather=Weather.CLEAR,
        road_condition=RoadCondition.CLEAR,
        cover=Cover.NONE,
        boundary=[[lon, lat], [lon + 0.01, lat], [lon, lat + 0.01]],
    )


def _unit(
    uid: str, type_id: str, lat: float, lon: float, fuel: float | None, h3: str
) -> UnitInstance:
    return UnitInstance(
        id=uid,
        name=uid,
        unit_type_id=type_id,
        lat=lat,
        lon=lon,
        h3_index=h3,
        status=InstanceStatus.OPERATIONAL,
        current_fuel_liters=fuel,
    )


class TestRepositionSuggestions:
    def test_low_fuel_unit_pulled_to_depot(self) -> None:
        catalog = build_unit_provider()
        # armor capacity 18000; 1000 L → ~6% → low fuel.
        units = [_unit("inst-armor-1", "armor-tank-coy", 49.25, 11.90, 1000.0, "hi")]
        depots = [FuelDepot(id="d", name="Depot", h3_index="dep", lat=49.20, lon=11.83)]
        tiles = [_tile("hi", 49.25, 11.90, 0)]
        out = reposition_suggestions(units, catalog, tiles, depots)
        assert len(out) == 1
        uid, lat, lon, _score, rationale = out[0]
        assert uid == "inst-armor-1"
        assert (lat, lon) == (49.20, 11.83)  # toward the depot
        assert "fuel" in rationale.lower()

    def test_high_threat_unit_pulled_to_safe_cell(self) -> None:
        catalog = build_unit_provider()
        # Full fuel so the fuel rule does not fire; sitting on a threat-5 tile.
        units = [_unit("inst-armor-1", "armor-tank-coy", 49.25, 11.90, 18000.0, "danger")]
        tiles = [
            _tile("danger", 49.25, 11.90, 5),
            _tile("safe", 49.26, 11.91, 0),
        ]
        out = reposition_suggestions(units, catalog, tiles, [])
        assert len(out) == 1
        _uid, lat, lon, _score, rationale = out[0]
        assert (lat, lon) == (49.26, 11.91)  # the safe cell
        assert "threat" in rationale.lower()

    def test_healthy_unit_no_suggestion(self) -> None:
        catalog = build_unit_provider()
        units = [_unit("inst-armor-1", "armor-tank-coy", 49.25, 11.90, 18000.0, "ok")]
        tiles = [_tile("ok", 49.25, 11.90, 0)]
        assert reposition_suggestions(units, catalog, tiles, []) == []


async def _client() -> tuple[AsyncClient, object, async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(Settings().database_url)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        await seed_unit_instances(session)
        await session.execute(
            text("UPDATE unit_instances SET current_fuel_liters=500 WHERE id='inst-armor-1'")
        )
        await session.commit()

    async def _override() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = _override
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test"), engine, maker


@pytest.mark.db
class TestMovementAdviceApi:
    async def test_reposition_endpoint(self) -> None:
        try:
            client, engine, _ = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            resp = await client.get("/api/v1/advice/reposition")
            assert resp.status_code == 200
            body = resp.json()
            assert body["kind"] == "reposition"
            # The drained armor unit should be flagged for repositioning.
            targets = {r["target"] for r in body["recommendations"]}
            assert "inst-armor-1" in targets
            for r in body["recommendations"]:
                assert r["action"]["endpoint"] == "move-orders"
                assert r["rationale"]
            cap = await client.get("/api/v1/advice/capabilities")
            assert {"route", "reposition"} <= set(cap.json()["kinds"])
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_route_endpoint(self) -> None:
        try:
            client, engine, maker = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            async with maker() as s:
                try:
                    ready = bool((await s.execute(text("SELECT count(*) FROM ways"))).scalar_one())
                except SQLAlchemyError:
                    ready = False
            if not ready:
                pytest.skip("routing graph empty — run build_routing_graph.sh")

            resp = await client.get(
                "/api/v1/advice/route",
                params={"instance_id": "inst-armor-1", "dest_lat": 49.20, "dest_lon": 11.83},
            )
            assert resp.status_code == 200
            body = resp.json()
            assert body["kind"] == "route"
            assert len(body["recommendations"]) >= 1
            assert body["recommendations"][0]["action"]["endpoint"] == "move-orders"
            assert body["recommendations"][0]["rationale"]
        finally:
            await client.aclose()
            await engine.dispose()
