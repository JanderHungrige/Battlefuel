"""Tests for routed fuel runs (v2 Wave 12 F1)."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings
from app.db import get_session
from app.main import create_app
from app.providers.unit_instances import build_unit_instance_provider
from app.services.instance_seed import seed_unit_instances


async def _client() -> tuple[AsyncClient, object, async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(Settings().database_url)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        await seed_unit_instances(session)
        await session.execute(text("DELETE FROM move_orders"))
        await session.execute(text("DELETE FROM refuel_orders"))
        await session.commit()

    async def _override() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = _override
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test"), engine, maker


@pytest.mark.db
class TestFuelRunApi:
    async def test_truck_routes_to_unit_and_refuel_is_active(self) -> None:
        try:
            client, engine, maker = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            instances = build_unit_instance_provider()
            async with maker() as s:
                unit = await instances.get_instance(s, "inst-armor-1")  # diesel
            assert unit is not None
            body = {
                "mover_id": "inst-fuel-1",
                "unit_id": "inst-armor-1",
                "truck_id": "inst-fuel-1",
                "dest_lat": unit.lat,
                "dest_lon": unit.lon,
                "metric": "safe",
            }
            resp = await client.post("/api/v1/fuel-runs", json=body)
            if resp.status_code == 422:
                pytest.skip("router unavailable (no road graph) — fuel run unroutable")
            assert resp.status_code == 201
            data = resp.json()
            # The truck got an active move order toward the unit.
            assert data["move_order"]["instance_id"] == "inst-fuel-1"
            assert data["move_order"]["status"] == "active"
            # The refuel order links unit↔truck and is active (transfers on co-location).
            assert data["refuel_order"]["unit_id"] == "inst-armor-1"
            assert data["refuel_order"]["truck_id"] == "inst-fuel-1"
            assert data["refuel_order"]["status"] == "active"
            assert data["refuel_order"]["fuel_type"] == "diesel"
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_unknown_mover_404(self) -> None:
        try:
            client, engine, _ = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            body = {
                "mover_id": "nope",
                "unit_id": "inst-armor-1",
                "truck_id": "nope",
                "dest_lat": 49.2,
                "dest_lon": 11.83,
            }
            assert (await client.post("/api/v1/fuel-runs", json=body)).status_code == 404
        finally:
            await client.aclose()
            await engine.dispose()
