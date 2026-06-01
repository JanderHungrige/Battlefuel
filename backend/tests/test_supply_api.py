"""Tests for the supply stock API (Wave 5 Feature 2: supply-stock-api)."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings
from app.db import get_session
from app.main import create_app
from app.services.instance_seed import seed_unit_instances
from app.services.supply_seed import seed_fuel_supply


async def _client() -> tuple[AsyncClient, object]:
    engine = create_async_engine(Settings().database_url)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        await seed_unit_instances(session)
        await seed_fuel_supply(session)

    async def _override() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = _override
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test"), engine


@pytest.mark.db
class TestSupplyApi:
    async def test_list_depots(self) -> None:
        try:
            client, engine = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            resp = await client.get("/api/v1/depots")
            assert resp.status_code == 200
            depots = resp.json()
            assert len(depots) >= 2
            assert {"id", "name", "h3_index", "lat", "lon"} <= set(depots[0])
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_get_depot_and_404(self) -> None:
        try:
            client, engine = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            ok = await client.get("/api/v1/depots/depot-main")
            assert ok.status_code == 200
            assert ok.json()["id"] == "depot-main"
            missing = await client.get("/api/v1/depots/nope")
            assert missing.status_code == 404
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_fuel_stocks_filters(self) -> None:
        try:
            client, engine = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            all_stocks = (await client.get("/api/v1/fuel-stocks")).json()
            assert len(all_stocks) >= 3

            by_depot = (await client.get("/api/v1/fuel-stocks?depot_id=depot-north")).json()
            assert by_depot and all(s["depot_id"] == "depot-north" for s in by_depot)

            by_type = (await client.get("/api/v1/fuel-stocks?fuel_type=diesel")).json()
            assert by_type and all(s["fuel_type"] == "diesel" for s in by_type)

            bad = await client.get("/api/v1/fuel-stocks?fuel_type=banana")
            assert bad.status_code == 422
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_distribution_overview(self) -> None:
        try:
            client, engine = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            resp = await client.get("/api/v1/supply/overview")
            assert resp.status_code == 200
            body = resp.json()
            # Depots carry their stock rows.
            assert len(body["depots"]) >= 2
            assert any(d["stocks"] for d in body["depots"])
            # The seeded TANKER (fuel-supply-pl) is a mobile fuel truck.
            truck_ids = {t["instance_id"] for t in body["trucks"]}
            assert "inst-fuel-1" in truck_ids
            # A non-fuel unit is NOT counted as a truck.
            assert "inst-armor-1" not in truck_ids
            # Totals present and positive.
            assert body["total_depot_liters_by_type"]["diesel"] > 0
            assert body["total_truck_liters"] >= 3800.0
        finally:
            await client.aclose()
            await engine.dispose()
