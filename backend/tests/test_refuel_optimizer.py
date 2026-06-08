"""Tests for the refuel optimizer (Wave 6 Feature 2: refuel-optimizer)."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings
from app.db import get_session
from app.domain.unit_instance import InstanceStatus, UnitInstance
from app.main import create_app
from app.services.instance_seed import seed_unit_instances
from app.services.refuel_assignment import assign_trucks, refuel_cost
from app.services.refuel_recommender import (
    NearestRefuelRecommender,
    OrToolsRefuelRecommender,
    build_refuel_recommender,
)


def _u(uid: str, lat: float, lon: float, fuel: float | None, h3: str = "x") -> UnitInstance:
    return UnitInstance(
        id=uid,
        name=uid,
        unit_type_id="fuel-supply-pl",
        lat=lat,
        lon=lon,
        h3_index=h3,
        status=InstanceStatus.OPERATIONAL,
        current_fuel_liters=fuel,
    )


class TestRefuelCost:
    def test_distance_dominates_when_adequate(self) -> None:
        near = refuel_cost(distance_m=1000, truck_fuel=9999, unit_deficit=500)
        far = refuel_cost(distance_m=20000, truck_fuel=9999, unit_deficit=500)
        assert far > near

    def test_inadequate_truck_penalised(self) -> None:
        ok = refuel_cost(distance_m=1000, truck_fuel=9999, unit_deficit=5000)
        short = refuel_cost(distance_m=1000, truck_fuel=100, unit_deficit=5000)
        assert short > ok

    def test_non_negative(self) -> None:
        assert refuel_cost(distance_m=0, truck_fuel=0, unit_deficit=0) >= 0


class TestAssignTrucks:
    def test_assigns_nearest_when_single_truck(self) -> None:
        units = [_u("near", 49.20, 11.80, 100.0), _u("far", 49.40, 12.10, 100.0)]
        trucks = [_u("T1", 49.205, 11.805, 5000.0)]
        result = assign_trucks(units, trucks)
        # Only one truck → exactly one served unit, and it is the nearer one.
        assert len(result) == 1
        assert result[0][0] == "near"
        assert result[0][1] == "T1"

    def test_two_units_two_trucks_each_served(self) -> None:
        units = [_u("A", 49.20, 11.80, 100.0), _u("B", 49.40, 12.10, 100.0)]
        trucks = [_u("TA", 49.205, 11.805, 5000.0), _u("TB", 49.405, 12.105, 5000.0)]
        result = dict((u, t) for u, t, _ in assign_trucks(units, trucks))
        assert result == {"A": "TA", "B": "TB"}

    def test_no_trucks_serves_nobody(self) -> None:
        assert assign_trucks([_u("A", 49.2, 11.8, 100.0)], []) == []


class TestRecommenderFactory:
    def test_ortools_registered(self) -> None:
        rec = build_refuel_recommender(Settings(refuel_recommender="ortools"))
        assert isinstance(rec, OrToolsRefuelRecommender)

    def test_nearest_still_available(self) -> None:
        rec = build_refuel_recommender(Settings(refuel_recommender="nearest"))
        assert isinstance(rec, NearestRefuelRecommender)

    def test_ortools_recommends_a_compatible_truck(self) -> None:
        unit = _u("thirsty", 49.20, 11.80, 100.0)
        near = _u("near", 49.205, 11.805, 5000.0)
        far = _u("far", 49.5, 12.2, 5000.0)
        rec = OrToolsRefuelRecommender().recommend(unit, [far, near])
        assert rec is not None
        assert rec.truck_id == "near"
        assert rec.rationale  # explained
        assert rec.score is not None  # optimizer fills the score

    def test_ortools_none_when_no_trucks(self) -> None:
        assert OrToolsRefuelRecommender().recommend(_u("u", 49.2, 11.8, 100.0), []) is None


async def _client() -> tuple[AsyncClient, object]:
    engine = create_async_engine(Settings().database_url)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        await seed_unit_instances(session)
        # Drain the armor unit so it is "thirsty".
        await session.execute(
            text("UPDATE unit_instances SET current_fuel_liters=1000 WHERE id='inst-armor-1'")
        )
        await session.commit()

    async def _override() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = _override
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test"), engine


@pytest.mark.db
class TestRefuelPlanApi:
    async def test_refuel_plan_returns_recommendations(self) -> None:
        try:
            client, engine = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            resp = await client.get("/api/v1/advice/refuel-plan")
            assert resp.status_code == 200
            body = resp.json()
            assert body["kind"] == "refuel"
            # Three seeded tankers (v2 Wave 11) → one optimal assignment per truck (≤3 units
            # served), each mapped to a refuel order with a distinct truck.
            recs = body["recommendations"]
            assert 1 <= len(recs) <= 3
            truck_ids = [r["action"]["truck_id"] for r in recs]
            assert len(truck_ids) == len(set(truck_ids))  # no truck double-assigned
            for r in recs:
                assert r["action"]["endpoint"] == "refuel-orders"
                assert r["action"]["unit_id"] == r["target"]
                assert r["rationale"]
                assert r["score"] >= 0

            cap = await client.get("/api/v1/advice/capabilities")
            assert "refuel" in cap.json()["kinds"]
        finally:
            await client.aclose()
            await engine.dispose()
