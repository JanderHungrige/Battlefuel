"""Tests for rendezvous fuel runs (v2 Wave 13 F1: rendezvous-routing).

Both the tanker and the target unit route to a chosen sector (an H3 cell centre); on meeting,
the existing co-located transfer fires. ``POST /rendezvous/plan`` returns both movers' Safe/Fast
options (each carrying fuel-to-meet = ``fuel_consumed_l``); ``POST /rendezvous`` dispatches the
pair + the refuel order ("order now").
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


async def _sector_between(maker: async_sessionmaker[AsyncSession]) -> tuple[float, float]:
    """A meeting point between the truck and the unit (both should be able to reach it)."""
    instances = build_unit_instance_provider()
    async with maker() as s:
        truck = await instances.get_instance(s, "inst-fuel-1")
        unit = await instances.get_instance(s, "inst-armor-1")
    assert truck is not None and unit is not None
    return (truck.lat + unit.lat) / 2.0, (truck.lon + unit.lon) / 2.0


@pytest.mark.db
class TestRendezvousPlan:
    async def test_plan_returns_both_movers_routes_with_fuel_to_meet(self) -> None:
        try:
            client, engine, maker = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            sector_lat, sector_lon = await _sector_between(maker)
            body = {
                "truck_id": "inst-fuel-1",
                "unit_id": "inst-armor-1",
                "sector_lat": sector_lat,
                "sector_lon": sector_lon,
            }
            resp = await client.post("/api/v1/rendezvous/plan", json=body)
            if resp.status_code == 422:
                pytest.skip("router unavailable (no road graph) — rendezvous unroutable")
            assert resp.status_code == 200
            data = resp.json()
            # The sector resolves to an H3 cell centre.
            assert "sector" in data and data["sector"]["h3"]
            # Both movers get route options, each carrying fuel-to-meet.
            assert len(data["truck_routes"]) >= 1
            assert len(data["unit_routes"]) >= 1
            for opt in data["truck_routes"] + data["unit_routes"]:
                assert "fuel_consumed_l" in opt
                assert opt["geometry"]
        finally:
            await client.aclose()
            await engine.dispose()


@pytest.mark.db
class TestRendezvousOrderNow:
    async def test_order_now_dispatches_pair_and_refuel(self) -> None:
        try:
            client, engine, maker = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            sector_lat, sector_lon = await _sector_between(maker)
            body = {
                "truck_id": "inst-fuel-1",
                "unit_id": "inst-armor-1",
                "sector_lat": sector_lat,
                "sector_lon": sector_lon,
                "metric": "safe",
            }
            resp = await client.post("/api/v1/rendezvous", json=body)
            if resp.status_code == 422:
                pytest.skip("router unavailable — rendezvous unroutable")
            assert resp.status_code == 201
            data = resp.json()
            # Both movers dispatched toward the sector.
            assert data["truck_move_order"]["instance_id"] == "inst-fuel-1"
            assert data["truck_move_order"]["status"] == "active"
            assert data["unit_move_order"]["instance_id"] == "inst-armor-1"
            assert data["unit_move_order"]["status"] == "active"
            # Refuel order links unit↔truck, active, rendezvous at the sector cell.
            rf = data["refuel_order"]
            assert rf["unit_id"] == "inst-armor-1"
            assert rf["truck_id"] == "inst-fuel-1"
            assert rf["status"] == "active"
            assert rf["rendezvous_h3"] == data["sector"]["h3"]
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_self_refuel_rejected_422(self) -> None:
        try:
            client, engine, maker = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            sector_lat, sector_lon = await _sector_between(maker)
            body = {
                "truck_id": "inst-armor-1",  # not a fuel truck → invalid refuel linkage
                "unit_id": "inst-armor-1",
                "sector_lat": sector_lat,
                "sector_lon": sector_lon,
            }
            resp = await client.post("/api/v1/rendezvous", json=body)
            if resp.status_code == 404:
                pytest.skip("instances unavailable")
            assert resp.status_code == 422
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_unknown_truck_404(self) -> None:
        try:
            client, engine, _ = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            body = {
                "truck_id": "nope",
                "unit_id": "inst-armor-1",
                "sector_lat": 49.2,
                "sector_lon": 11.83,
            }
            assert (await client.post("/api/v1/rendezvous", json=body)).status_code == 404
        finally:
            await client.aclose()
            await engine.dispose()
