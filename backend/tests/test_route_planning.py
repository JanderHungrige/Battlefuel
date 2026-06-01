"""Tests for route planning (Wave 3 Feature 2: route-planning-api)."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings
from app.db import get_session
from app.domain.route import RouteMetric, RoutePath
from app.main import create_app
from app.services.instance_seed import seed_unit_instances
from app.services.route_planner import build_option


def _path(distance_m: float = 10000.0) -> RoutePath:
    return RoutePath(
        metric=RouteMetric.FAST,
        geometry=[[11.83, 49.20], [11.86, 49.23]],
        distance_m=distance_m,
        threat_max=0,
        threat_avg=0.0,
    )


class TestBuildOption:
    def test_duration_and_fuel(self) -> None:
        # 10 km at 60 km/h = 600 s; 900 L/h over 1/6 h = 150 L burned.
        opt = build_option(
            _path(),
            label="fastest",
            speed_road_kph=60,
            consumption_normal_lph=900,
            start_fuel_l=18000,
        )
        assert opt.duration_s == pytest.approx(600.0, abs=1)
        assert opt.fuel_consumed_l == pytest.approx(150.0, abs=0.5)
        assert opt.fuel_remaining_l == pytest.approx(17850.0, abs=0.5)
        assert opt.sufficient_fuel is True

    def test_insufficient_fuel_flagged_and_clamped(self) -> None:
        opt = build_option(
            _path(), label="fastest", speed_road_kph=60, consumption_normal_lph=900, start_fuel_l=50
        )
        assert opt.sufficient_fuel is False
        assert opt.fuel_remaining_l == 0.0

    def test_zero_speed_unit_has_zero_duration(self) -> None:
        opt = build_option(
            _path(), label="fastest", speed_road_kph=0, consumption_normal_lph=0, start_fuel_l=0
        )
        assert opt.duration_s == 0.0
        assert opt.fuel_consumed_l == 0.0


async def _client_and_engine() -> tuple[AsyncClient, object]:
    engine = create_async_engine(Settings().database_url)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        await seed_unit_instances(session)

    async def _override() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = _override
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test"), engine


async def _graph_ready(engine: object) -> bool:
    maker = async_sessionmaker(engine, expire_on_commit=False)  # type: ignore[arg-type]
    async with maker() as s:
        try:
            return bool((await s.execute(text("SELECT count(*) FROM ways"))).scalar_one())
        except SQLAlchemyError:
            return False


@pytest.mark.db
class TestPlanRouteApi:
    async def test_plans_fastest_and_safest(self) -> None:
        try:
            client, engine = await _client_and_engine()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            if not await _graph_ready(engine):
                pytest.skip("routing graph empty — run build_routing_graph.sh")
            resp = await client.post(
                "/api/v1/routes/plan",
                json={"instance_id": "inst-armor-1", "dest_lat": 49.20, "dest_lon": 11.83},
            )
            assert resp.status_code == 200
            options = resp.json()
            assert len(options) >= 1
            labels = {o["label"] for o in options}
            assert labels <= {"fastest", "safest"}
            first = options[0]
            assert first["distance_m"] > 0
            assert first["duration_s"] > 0
            assert "fuel_remaining_l" in first and "sufficient_fuel" in first
            assert len(first["geometry"]) >= 2
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_unknown_instance_404(self) -> None:
        try:
            client, engine = await _client_and_engine()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            resp = await client.post(
                "/api/v1/routes/plan",
                json={"instance_id": "nope", "dest_lat": 49.2, "dest_lon": 11.83},
            )
            assert resp.status_code == 404
        finally:
            await client.aclose()
            await engine.dispose()
