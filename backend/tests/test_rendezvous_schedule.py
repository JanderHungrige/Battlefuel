"""Tests for scheduled rendezvous orders (v2 Wave 13 F2).

A rendezvous can be planned against the sim clock: it is filed as ``planned`` with a countdown;
when the countdown elapses the sim fires a reminder and flips it to ``due`` (NEVER auto-dispatch);
the operator then confirm-launches, which dispatches both movers + the refuel.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.ws import ConnectionManager
from app.config import Settings
from app.db import get_session
from app.main import create_app
from app.providers.move_orders import build_move_order_provider
from app.providers.unit_instances import build_unit_instance_provider
from app.services.instance_seed import seed_unit_instances
from app.services.sim_runner import SimEngine


async def _client() -> tuple[AsyncClient, object, async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(Settings().database_url)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        await seed_unit_instances(session)
        await session.execute(text("DELETE FROM rendezvous_orders"))
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
    instances = build_unit_instance_provider()
    async with maker() as s:
        truck = await instances.get_instance(s, "inst-fuel-1")
        unit = await instances.get_instance(s, "inst-armor-1")
    assert truck is not None and unit is not None
    return (truck.lat + unit.lat) / 2.0, (truck.lon + unit.lon) / 2.0


async def _schedule(client: AsyncClient, lat: float, lon: float, delay: float) -> dict | None:
    body = {
        "truck_id": "inst-fuel-1",
        "unit_id": "inst-armor-1",
        "sector_lat": lat,
        "sector_lon": lon,
        "metric": "safe",
        "scheduled_game_s": delay,
    }
    resp = await client.post("/api/v1/rendezvous/schedule", json=body)
    if resp.status_code == 422:
        return None
    assert resp.status_code == 201
    return resp.json()


@pytest.mark.db
class TestScheduleAndArchive:
    async def test_schedule_files_planned_order_with_route_snapshots(self) -> None:
        try:
            client, engine, maker = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            lat, lon = await _sector_between(maker)
            order = await _schedule(client, lat, lon, 300.0)
            if order is None:
                pytest.skip("router unavailable — rendezvous unschedulable")
            assert order["status"] == "planned"
            assert order["remaining_game_s"] == 300.0
            assert order["scheduled_game_s"] == 300.0
            assert order["truck_geometry"] and order["unit_geometry"]
            assert order["unit_fuel_to_meet"] >= 0.0
            # It appears in the archive, and the single-order fetch carries both geometries.
            listed = (await client.get("/api/v1/rendezvous")).json()
            assert any(o["id"] == order["id"] for o in listed)
            one = (await client.get(f"/api/v1/rendezvous/{order['id']}")).json()
            assert one["unit_geometry"] == order["unit_geometry"]
        finally:
            await client.aclose()
            await engine.dispose()


@pytest.mark.db
class TestReminderNoAutoDispatch:
    async def test_due_reminder_fires_once_and_does_not_dispatch(self) -> None:
        try:
            client, engine, maker = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            lat, lon = await _sector_between(maker)
            order = await _schedule(client, lat, lon, 60.0)
            if order is None:
                pytest.skip("router unavailable — rendezvous unschedulable")

            sim = SimEngine(ConnectionManager())
            async with maker() as s:
                fired = await sim.check_rendezvous_reminders(s, 120.0)  # past the 60s schedule
            assert fired == 1
            # Reminder flips the order to "due" — NOT launched, and NO movement was dispatched.
            refreshed = (await client.get(f"/api/v1/rendezvous/{order['id']}")).json()
            assert refreshed["status"] == "due"
            move_orders = build_move_order_provider()
            async with maker() as s:
                active = await move_orders.list_active(s)
            assert active == [] or all(
                mo.instance_id not in ("inst-fuel-1", "inst-armor-1") for mo in active
            )
            # A second tick does not re-fire (only planned orders count down).
            async with maker() as s:
                again = await sim.check_rendezvous_reminders(s, 120.0)
            assert again == 0
        finally:
            await client.aclose()
            await engine.dispose()


@pytest.mark.db
class TestConfirmLaunch:
    async def test_confirm_launch_dispatches_pair_and_refuel(self) -> None:
        try:
            client, engine, maker = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            lat, lon = await _sector_between(maker)
            order = await _schedule(client, lat, lon, 300.0)
            if order is None:
                pytest.skip("router unavailable — rendezvous unschedulable")
            resp = await client.post(f"/api/v1/rendezvous/{order['id']}/confirm-launch")
            if resp.status_code == 422:
                pytest.skip("router unavailable at launch")
            assert resp.status_code == 201
            data = resp.json()
            assert data["rendezvous_order"]["status"] == "launched"
            assert data["truck_move_order"]["status"] == "active"
            assert data["unit_move_order"]["status"] == "active"
            assert data["refuel_order"]["status"] == "active"
            # A second launch is rejected.
            again = await client.post(f"/api/v1/rendezvous/{order['id']}/confirm-launch")
            assert again.status_code == 409
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_confirm_launch_unknown_404(self) -> None:
        try:
            client, engine, _ = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            resp = await client.post("/api/v1/rendezvous/nope/confirm-launch")
            assert resp.status_code == 404
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_cancel_planned_order(self) -> None:
        try:
            client, engine, maker = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            lat, lon = await _sector_between(maker)
            order = await _schedule(client, lat, lon, 300.0)
            if order is None:
                pytest.skip("router unavailable — rendezvous unschedulable")
            resp = await client.post(f"/api/v1/rendezvous/{order['id']}/cancel")
            assert resp.status_code == 200
            assert resp.json()["status"] == "cancelled"
        finally:
            await client.aclose()
            await engine.dispose()
