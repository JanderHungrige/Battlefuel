"""Tests for the redistribution optimizer (Wave 6 Feature 3: redistribution-optimizer)."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings
from app.db import get_session
from app.domain.supply import FuelDepot, FuelStock
from app.domain.unit import FuelType
from app.main import create_app
from app.services.redistribution import redistribution_plan
from app.services.supply_seed import seed_fuel_supply

_D1 = FuelDepot(id="d1", name="D1", h3_index="x", lat=49.20, lon=11.80)
_D2 = FuelDepot(id="d2", name="D2", h3_index="y", lat=49.30, lon=11.95)


def _stock(depot: str, qty: float, cap: float, ft: FuelType = FuelType.DIESEL) -> FuelStock:
    return FuelStock(depot_id=depot, fuel_type=ft, quantity_liters=qty, capacity_liters=cap)


class TestRedistributionPlan:
    def test_transfer_from_surplus_to_deficit(self) -> None:
        # d1 well above 50% target (source), d2 below (sink).
        stocks = [_stock("d1", 8000, 10000), _stock("d2", 1000, 10000)]
        moves = redistribution_plan([_D1, _D2], stocks, target_fraction=0.5)
        transfers = [m for m in moves if m.kind == "transfer"]
        assert transfers, "expected at least one transfer"
        t = transfers[0]
        assert t.from_depot == "d1"
        assert t.to_depot == "d2"
        assert t.fuel_type == "diesel"
        assert t.liters > 0

    def test_deficit_with_no_source_becomes_buy(self) -> None:
        # Only one depot, below target, nobody to transfer from → buy.
        stocks = [_stock("d2", 1000, 10000)]
        moves = redistribution_plan([_D2], stocks, target_fraction=0.5)
        buys = [m for m in moves if m.kind == "buy"]
        assert buys
        assert buys[0].to_depot == "d2"
        assert buys[0].liters > 0

    def test_balanced_is_empty(self) -> None:
        stocks = [_stock("d1", 5000, 10000), _stock("d2", 5000, 10000)]
        assert redistribution_plan([_D1, _D2], stocks, target_fraction=0.5) == []


async def _client() -> tuple[AsyncClient, object]:
    engine = create_async_engine(Settings().database_url)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        await seed_fuel_supply(session)

    async def _override() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = _override
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test"), engine


@pytest.mark.db
class TestRedistributionApi:
    async def test_redistribution_advice(self) -> None:
        try:
            client, engine = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            resp = await client.get("/api/v1/advice/redistribution")
            assert resp.status_code == 200
            body = resp.json()
            assert body["kind"] == "redistribution"
            # Seeded depots are unbalanced (depot-main diesel 75%, depot-north 45%) → ≥1 move.
            assert len(body["recommendations"]) >= 1
            for r in body["recommendations"]:
                assert r["rationale"]
                assert r["kind"] == "redistribution"

            cap = await client.get("/api/v1/advice/capabilities")
            assert "redistribution" in cap.json()["kinds"]
        finally:
            await client.aclose()
            await engine.dispose()
