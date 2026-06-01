"""Tests for refuel orders (Wave 5 Feature 3: refuel-orders).

Pure transfer math + recommender are DB-free; order lifecycle + co-located completion are
marked ``db`` and skip when no database is reachable.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings
from app.db import get_session
from app.domain.refuel import RefuelOrderStatus
from app.domain.unit_instance import InstanceStatus, UnitInstance
from app.main import create_app
from app.providers.factory import build_unit_provider
from app.providers.refuel_orders import (
    DbRefuelOrderProvider,
    UnknownRefuelOrderProviderError,
    build_refuel_order_provider,
)
from app.providers.unit_instances import build_unit_instance_provider
from app.services.instance_seed import seed_unit_instances
from app.services.refuel_recommender import (
    NearestRefuelRecommender,
    UnknownRecommenderError,
    build_refuel_recommender,
)
from app.services.refuel_service import co_located, compute_transfer, try_complete_refuel


def _unit(uid: str, lat: float, lon: float, fuel: float | None, h3: str = "x") -> UnitInstance:
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


class TestTransferMath:
    def test_fill_to_capacity(self) -> None:
        assert compute_transfer(unit_fuel=1000, unit_capacity=5000, truck_fuel=9999) == 4000

    def test_limited_by_truck(self) -> None:
        assert compute_transfer(unit_fuel=0, unit_capacity=5000, truck_fuel=1200) == 1200

    def test_requested_cap(self) -> None:
        assert compute_transfer(0, 5000, 9999, requested_liters=300) == 300

    def test_unit_full_transfers_zero(self) -> None:
        assert compute_transfer(5000, 5000, 9999) == 0

    def test_truck_empty_transfers_zero(self) -> None:
        assert compute_transfer(0, 5000, 0) == 0

    def test_co_located(self) -> None:
        assert co_located("abc", "abc") is True
        assert co_located("abc", "def") is False
        assert co_located("", "") is False


class TestRecommender:
    def test_picks_nearest_fueled_truck(self) -> None:
        unit = _unit("u", 49.20, 11.83, 100.0)
        far = _unit("far", 49.40, 12.10, 3000.0)
        near = _unit("near", 49.205, 11.835, 3000.0)
        rec = NearestRefuelRecommender().recommend(unit, [far, near])
        assert rec is not None
        assert rec.truck_id == "near"
        # Rendezvous is the unit's own position (transfer needs identical position).
        assert rec.rendezvous.lat == unit.lat
        assert rec.rendezvous.h3_index == unit.h3_index
        # Placeholder leaves the optimizer fields empty.
        assert rec.score is None
        assert rec.rationale is None

    def test_no_fueled_trucks_returns_none(self) -> None:
        unit = _unit("u", 49.20, 11.83, 100.0)
        empty = _unit("empty", 49.205, 11.835, 0.0)
        assert NearestRefuelRecommender().recommend(unit, [empty]) is None
        assert NearestRefuelRecommender().recommend(unit, []) is None


class TestFactories:
    def test_build_recommender(self) -> None:
        rec = build_refuel_recommender(Settings(refuel_recommender="nearest"))
        assert isinstance(rec, NearestRefuelRecommender)

    def test_unknown_recommender_raises(self) -> None:
        with pytest.raises(UnknownRecommenderError):
            build_refuel_recommender(Settings(refuel_recommender="nope"))

    def test_build_order_provider(self) -> None:
        assert isinstance(
            build_refuel_order_provider(Settings(refuel_order_provider="db")),
            DbRefuelOrderProvider,
        )

    def test_unknown_order_provider_raises(self) -> None:
        with pytest.raises(UnknownRefuelOrderProviderError):
            build_refuel_order_provider(Settings(refuel_order_provider="nope"))


async def _client() -> tuple[AsyncClient, object, async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(Settings().database_url)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        await seed_unit_instances(session)
        await session.execute(text("DELETE FROM refuel_orders"))
        await session.commit()

    async def _override() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = _override
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test"), engine, maker


@pytest.mark.db
class TestRefuelOrderApi:
    async def test_create_recommends_tanker(self) -> None:
        try:
            client, engine, _ = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            # inst-armor-1 is diesel; inst-fuel-1 (TANKER) is the diesel fuel truck.
            resp = await client.post("/api/v1/refuel-orders", json={"unit_id": "inst-armor-1"})
            assert resp.status_code == 201
            order = resp.json()
            assert order["truck_id"] == "inst-fuel-1"
            assert order["unit_id"] == "inst-armor-1"
            assert order["status"] == "pending"
            assert order["fuel_type"] == "diesel"

            confirmed = await client.post(f"/api/v1/refuel-orders/{order['id']}/confirm")
            assert confirmed.json()["status"] == "active"

            cancelled = await client.post(f"/api/v1/refuel-orders/{order['id']}/cancel")
            assert cancelled.json()["status"] == "cancelled"
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_unknown_unit_404(self) -> None:
        try:
            client, engine, _ = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            resp = await client.post("/api/v1/refuel-orders", json={"unit_id": "nope"})
            assert resp.status_code == 404
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_colocated_transfer_completes(self) -> None:
        try:
            client, engine, maker = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            # Drain the armor unit a bit and co-locate it with the tanker.
            instances = build_unit_instance_provider()
            units = build_unit_provider()
            async with maker() as s:
                tanker = await instances.get_instance(s, "inst-fuel-1")
                assert tanker is not None
                await s.execute(
                    text(
                        "UPDATE unit_instances SET lat=:lat, lon=:lon, h3_index=:h3, "
                        "current_fuel_liters=5000 WHERE id='inst-armor-1'"
                    ),
                    {"lat": tanker.lat, "lon": tanker.lon, "h3": tanker.h3_index},
                )
                await s.commit()

            created = await client.post("/api/v1/refuel-orders", json={"unit_id": "inst-armor-1"})
            oid = created.json()["id"]
            await client.post(f"/api/v1/refuel-orders/{oid}/confirm")

            orders = build_refuel_order_provider()
            async with maker() as s:
                order = await orders.get(s, oid)
                assert order is not None
                truck_before = (await instances.get_instance(s, "inst-fuel-1")).current_fuel_liters
                done = await try_complete_refuel(s, instances, units, orders, order)
            assert done is not None
            assert done.status is RefuelOrderStatus.COMPLETE
            assert done.transferred_liters > 0

            async with maker() as s:
                unit_after = (await instances.get_instance(s, "inst-armor-1")).current_fuel_liters
                truck_after = (await instances.get_instance(s, "inst-fuel-1")).current_fuel_liters
            assert unit_after == 5000 + done.transferred_liters
            assert truck_after == truck_before - done.transferred_liters
        finally:
            await client.aclose()
            await engine.dispose()
