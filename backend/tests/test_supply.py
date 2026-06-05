"""Tests for the fuel supply model (Wave 5 Feature 1: fuel-supply-model).

Pure domain tests run anywhere; provider tests are marked ``db`` and skip gracefully when
no PostgreSQL is reachable (same pattern as the move-order / unit-instance suites).
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings
from app.domain.supply import FuelDepot, FuelStock, LogisticSiteType
from app.domain.unit import FuelType
from app.providers.supply import (
    DbSupplyProvider,
    SupplyProvider,
    UnknownSupplyProviderError,
    build_supply_provider,
)
from app.services.supply_seed import seed_fuel_supply


class TestSupplyDomain:
    def test_depot_construction(self) -> None:
        depot = FuelDepot(id="depot-x", name="Depot X", h3_index="8a1234", lat=49.2, lon=11.8)
        assert depot.id == "depot-x"
        assert depot.name == "Depot X"

    def test_stock_construction(self) -> None:
        stock = FuelStock(
            depot_id="depot-x",
            fuel_type=FuelType.DIESEL,
            quantity_liters=1000.0,
            capacity_liters=5000.0,
        )
        assert stock.fuel_type is FuelType.DIESEL
        assert stock.quantity_liters == 1000.0
        assert stock.capacity_liters == 5000.0

    def test_negative_quantity_rejected(self) -> None:
        with pytest.raises(ValidationError):
            FuelStock(
                depot_id="d",
                fuel_type=FuelType.DIESEL,
                quantity_liters=-1.0,
                capacity_liters=10.0,
            )

    def test_negative_capacity_rejected(self) -> None:
        with pytest.raises(ValidationError):
            FuelStock(
                depot_id="d",
                fuel_type=FuelType.DIESEL,
                quantity_liters=0.0,
                capacity_liters=-5.0,
            )


class TestSupplyFactory:
    def test_build_db_provider(self) -> None:
        provider = build_supply_provider(Settings(supply_provider="db"))
        assert isinstance(provider, DbSupplyProvider)
        assert isinstance(provider, SupplyProvider)

    def test_unknown_provider_raises(self) -> None:
        with pytest.raises(UnknownSupplyProviderError):
            build_supply_provider(Settings(supply_provider="nope"))


def _maker() -> async_sessionmaker[AsyncSession]:
    engine = create_async_engine(Settings().database_url)
    return async_sessionmaker(engine, expire_on_commit=False)


async def _delete_depot(maker: async_sessionmaker[AsyncSession], depot_id: str) -> None:
    """Remove a test-created depot + its stock so the shared DB stays clean for sibling tests."""
    async with maker() as session:
        await session.execute(
            text("DELETE FROM fuel_stocks WHERE depot_id = :id"), {"id": depot_id}
        )
        await session.execute(text("DELETE FROM fuel_depots WHERE id = :id"), {"id": depot_id})
        await session.commit()


@pytest.mark.db
class TestDbSupplyProvider:
    async def _seeded(self) -> async_sessionmaker[AsyncSession]:
        maker = _maker()
        async with maker() as session:
            await seed_fuel_supply(session)
        return maker

    async def test_seed_and_list_depots(self) -> None:
        try:
            maker = await self._seeded()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        provider = DbSupplyProvider()
        async with maker() as session:
            depots = await provider.list_depots(session)
            assert len(depots) >= 1
            one = await provider.get_depot(session, depots[0].id)
            assert one is not None
            assert one.id == depots[0].id
            assert await provider.get_depot(session, "no-such-depot") is None

    async def test_create_typed_site_seeds_stock(self) -> None:
        # v2 Wave 11 F5: a typed logistic site is created stocked + refuelable.
        try:
            maker = await self._seeded()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        provider = DbSupplyProvider()
        async with maker() as session:
            site = await provider.create_depot(
                session, "Bravo BSA", 49.21, 11.84, LogisticSiteType.BSA
            )
        try:
            async with maker() as session:
                fetched = await provider.get_depot(session, site.id)
                assert fetched is not None and fetched.site_type is LogisticSiteType.BSA
                stocks = await provider.list_stocks(session, depot_id=site.id)
                kinds = {s.fuel_type for s in stocks}
                assert FuelType.DIESEL in kinds and FuelType.JP8 in kinds
                # Seeded below capacity so the site can propose a refuel.
                diesel = next(s for s in stocks if s.fuel_type is FuelType.DIESEL)
                assert 0 < diesel.quantity_liters < diesel.capacity_liters
        finally:
            await _delete_depot(maker, site.id)

    async def test_create_plain_depot_has_no_stock(self) -> None:
        try:
            maker = await self._seeded()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        provider = DbSupplyProvider()
        async with maker() as session:
            depot = await provider.create_depot(session, "Bare marker", 49.22, 11.85)
        try:
            async with maker() as session:
                fetched = await provider.get_depot(session, depot.id)
                assert fetched is not None and fetched.site_type is None
                assert await provider.list_stocks(session, depot_id=depot.id) == []
        finally:
            await _delete_depot(maker, depot.id)

    async def test_stocks_listed_per_depot(self) -> None:
        try:
            maker = await self._seeded()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        provider = DbSupplyProvider()
        async with maker() as session:
            depots = await provider.list_depots(session)
            stocks = await provider.list_stocks(session, depot_id=depots[0].id)
            assert len(stocks) >= 1
            assert all(s.depot_id == depots[0].id for s in stocks)
            assert all(0 <= s.quantity_liters <= s.capacity_liters for s in stocks)

    async def test_adjust_stock_adds_and_clamps_to_capacity(self) -> None:
        try:
            maker = await self._seeded()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        provider = DbSupplyProvider()
        async with maker() as session:
            stock = (await provider.list_stocks(session))[0]
            updated = await provider.adjust_stock(
                session, stock.depot_id, stock.fuel_type, delta_liters=10_000_000.0
            )
            assert updated is not None
            assert updated.quantity_liters == updated.capacity_liters

    async def test_adjust_stock_floors_at_zero(self) -> None:
        try:
            maker = await self._seeded()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        provider = DbSupplyProvider()
        async with maker() as session:
            stock = (await provider.list_stocks(session))[0]
            updated = await provider.adjust_stock(
                session, stock.depot_id, stock.fuel_type, delta_liters=-10_000_000.0
            )
            assert updated is not None
            assert updated.quantity_liters == 0.0

    async def test_adjust_unknown_stock_returns_none(self) -> None:
        try:
            maker = await self._seeded()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        provider = DbSupplyProvider()
        async with maker() as session:
            result = await provider.adjust_stock(
                session, "no-such-depot", FuelType.DIESEL, delta_liters=1.0
            )
            assert result is None

    async def test_seed_is_idempotent(self) -> None:
        try:
            maker = await self._seeded()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        provider = DbSupplyProvider()
        async with maker() as session:
            before = len(await provider.list_depots(session))
            await seed_fuel_supply(session)
        async with maker() as session:
            after = len(await provider.list_depots(session))
            assert before == after
        # quantities reset to canonical on re-seed
        async with maker() as session:
            await provider.adjust_stock(
                session,
                (await provider.list_depots(session))[0].id,
                FuelType.DIESEL,
                delta_liters=-1.0,
            )
            await seed_fuel_supply(session)
            row = await session.execute(text("SELECT count(*) FROM fuel_depots"))
            assert row.scalar_one() == before
