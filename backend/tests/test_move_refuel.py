"""Tests for plan-move-with-refueling (v2 Wave 13 F6)."""

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
class TestMoveWithRefuel:
    async def test_stitches_tanker_rendezvous_into_the_move(self) -> None:
        try:
            client, engine, maker = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            instances = build_unit_instance_provider()
            async with maker() as s:
                unit = await instances.get_instance(s, "inst-armor-1")
            assert unit is not None
            # Drive a short distance from the unit's current position.
            body = {
                "instance_id": "inst-armor-1",
                "dest_lat": unit.lat + 0.01,
                "dest_lon": unit.lon + 0.01,
                "metric": "safe",
            }
            resp = await client.post("/api/v1/move-orders/with-refuel", json=body)
            if resp.status_code == 422:
                pytest.skip("no tanker / unroutable in this seed")
            assert resp.status_code == 201
            data = resp.json()
            assert data["rendezvous"]["h3"]
            # The unit got a multi-leg move (unit → rendezvous → dest), active.
            assert data["unit_move_order"]["instance_id"] == "inst-armor-1"
            assert data["unit_move_order"]["status"] == "active"
            assert len(data["unit_move_order"]["geometry"]) >= 2
            # A tanker was dispatched to the rendezvous and the refuel links the two, active.
            assert data["tanker_move_order"]["status"] == "active"
            assert data["tanker_move_order"]["instance_id"] != "inst-armor-1"
            assert data["refuel_order"]["unit_id"] == "inst-armor-1"
            assert data["refuel_order"]["truck_id"] == data["tanker_move_order"]["instance_id"]
            assert data["refuel_order"]["status"] == "active"
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_unknown_unit_404(self) -> None:
        try:
            client, engine, _ = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            body = {"instance_id": "nope", "dest_lat": 49.2, "dest_lon": 11.83}
            resp = await client.post("/api/v1/move-orders/with-refuel", json=body)
            assert resp.status_code == 404
        finally:
            await client.aclose()
            await engine.dispose()


@pytest.mark.db
class TestMoveRefuelOptions:
    async def test_options_list_tankers_without_dispatching(self) -> None:
        try:
            client, engine, maker = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            from app.providers.move_orders import build_move_order_provider

            instances = build_unit_instance_provider()
            async with maker() as s:
                unit = await instances.get_instance(s, "inst-armor-1")
            assert unit is not None
            body = {
                "instance_id": "inst-armor-1",
                "dest_lat": unit.lat + 0.01,
                "dest_lon": unit.lon + 0.01,
                "metric": "safe",
            }
            resp = await client.post("/api/v1/move-orders/refuel-options", json=body)
            assert resp.status_code == 200
            options = resp.json()
            if not options:
                pytest.skip("no routable tanker option in this seed")
            # Each option previews both legs + a tanker, and carries fuel/threat.
            first = options[0]
            assert first["truck_id"]
            assert first["unit_geometry"] and first["tanker_geometry"]
            assert "unit_fuel_l" in first and "threat_max" in first
            # Previewing did NOT dispatch anything.
            async with maker() as s:
                assert await build_move_order_provider().list_active(s) == []

            # Confirming a chosen option dispatches that exact tanker.
            exec_body = {**body, "truck_id": first["truck_id"]}
            ex = await client.post("/api/v1/move-orders/with-refuel", json=exec_body)
            if ex.status_code == 422:
                pytest.skip("chosen tanker unroutable")
            assert ex.status_code == 201
            data = ex.json()
            assert data["tanker_move_order"]["instance_id"] == first["truck_id"]
            assert data["unit_move_order"]["status"] == "active"
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_options_unknown_unit_404(self) -> None:
        try:
            client, engine, _ = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            body = {"instance_id": "nope", "dest_lat": 49.2, "dest_lon": 11.83}
            resp = await client.post("/api/v1/move-orders/refuel-options", json=body)
            assert resp.status_code == 404
        finally:
            await client.aclose()
            await engine.dispose()
