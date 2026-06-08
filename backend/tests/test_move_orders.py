"""Tests for move orders (Wave 3 Feature 3: move-orders)."""

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
from app.services.instance_seed import seed_unit_instances


async def _client_and_engine() -> tuple[AsyncClient, object, async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(Settings().database_url)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        await seed_unit_instances(session)
        await session.execute(text("DELETE FROM move_orders"))
        await session.commit()

    async def _override() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = _override
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test"), engine, maker


async def _graph_ready(maker: async_sessionmaker[AsyncSession]) -> bool:
    async with maker() as s:
        try:
            return bool((await s.execute(text("SELECT count(*) FROM ways"))).scalar_one())
        except SQLAlchemyError:
            return False


_BODY = {"instance_id": "inst-armor-1", "dest_lat": 49.20, "dest_lon": 11.83, "metric": "fast"}


@pytest.mark.db
class TestMoveOrders:
    async def test_create_confirm_get_list_cancel(self) -> None:
        try:
            client, engine, maker = await _client_and_engine()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            if not await _graph_ready(maker):
                pytest.skip("routing graph empty — run build_routing_graph.sh")

            created = await client.post("/api/v1/move-orders", json=_BODY)
            assert created.status_code == 201
            order = created.json()
            assert order["status"] == "pending"
            assert order["distance_m"] > 0
            assert len(order["geometry"]) >= 2
            oid = order["id"]

            confirmed = await client.post(f"/api/v1/move-orders/{oid}/confirm")
            assert confirmed.status_code == 200
            assert confirmed.json()["status"] == "active"

            got = await client.get(f"/api/v1/move-orders/{oid}")
            assert got.status_code == 200 and got.json()["id"] == oid

            listing = await client.get("/api/v1/move-orders")
            assert any(o["id"] == oid for o in listing.json())

            cancelled = await client.post(f"/api/v1/move-orders/{oid}/cancel")
            assert cancelled.json()["status"] == "cancelled"
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_create_unknown_instance_404(self) -> None:
        try:
            client, engine, _ = await _client_and_engine()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            resp = await client.post("/api/v1/move-orders", json={**_BODY, "instance_id": "nope"})
            assert resp.status_code == 404
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_confirm_unknown_order_404(self) -> None:
        try:
            client, engine, _ = await _client_and_engine()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            resp = await client.post("/api/v1/move-orders/does-not-exist/confirm")
            assert resp.status_code == 404
        finally:
            await client.aclose()
            await engine.dispose()


@pytest.mark.db
class TestProceedSlowly:
    """F1 (Wave 10, doc 60): the operator opts a HALTED order into 'proceed slowly' — it
    flips to 'crossing' and the sim crawls it across the obstruction. RED until F1 is built.
    """

    async def _create_and_confirm(self, client: AsyncClient) -> str:
        created = await client.post("/api/v1/move-orders", json=_BODY)
        assert created.status_code == 201
        oid: str = created.json()["id"]
        await client.post(f"/api/v1/move-orders/{oid}/confirm")
        return oid

    async def test_proceed_on_halted_order_sets_crossing(self) -> None:
        try:
            client, engine, maker = await _client_and_engine()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            if not await _graph_ready(maker):
                pytest.skip("routing graph empty — run build_routing_graph.sh")
            oid = await self._create_and_confirm(client)
            # Force the order into 'halted' (as the sim would on hitting a block).
            async with maker() as s:
                await s.execute(
                    text("UPDATE move_orders SET status='halted' WHERE id=:id"), {"id": oid}
                )
                await s.commit()

            resp = await client.post(f"/api/v1/move-orders/{oid}/proceed")
            assert resp.status_code == 200
            assert resp.json()["status"] == "crossing"
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_proceed_on_active_order_409(self) -> None:
        try:
            client, engine, maker = await _client_and_engine()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            if not await _graph_ready(maker):
                pytest.skip("routing graph empty — run build_routing_graph.sh")
            oid = await self._create_and_confirm(client)  # status == active
            resp = await client.post(f"/api/v1/move-orders/{oid}/proceed")
            assert resp.status_code == 409  # only a halted order can proceed-slowly
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_proceed_unknown_order_404(self) -> None:
        try:
            client, engine, _ = await _client_and_engine()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            resp = await client.post("/api/v1/move-orders/does-not-exist/proceed")
            assert resp.status_code == 404
        finally:
            await client.aclose()
            await engine.dispose()


@pytest.mark.db
class TestWaypointMoveOrders:
    """F5 (Wave 10, doc 64): create a move order from an ordered waypoint route, then confirm it."""

    async def test_create_waypoint_order_and_confirm(self) -> None:
        try:
            client, engine, maker = await _client_and_engine()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            if not await _graph_ready(maker):
                pytest.skip("routing graph empty — run build_routing_graph.sh")
            created = await client.post(
                "/api/v1/move-orders/waypoints",
                json={
                    "instance_id": "inst-armor-1",
                    "waypoints": [{"lat": 49.22, "lon": 11.86}, {"lat": 49.20, "lon": 11.83}],
                    "metric": "fast",
                },
            )
            assert created.status_code == 201
            order = created.json()
            assert order["status"] == "pending"
            assert order["distance_m"] > 0
            assert len(order["geometry"]) >= 2  # stitched multi-leg path

            confirmed = await client.post(f"/api/v1/move-orders/{order['id']}/confirm")
            assert confirmed.status_code == 200 and confirmed.json()["status"] == "active"
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_create_waypoint_order_empty_422(self) -> None:
        try:
            client, engine, _ = await _client_and_engine()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            resp = await client.post(
                "/api/v1/move-orders/waypoints",
                json={"instance_id": "inst-armor-1", "waypoints": []},
            )
            assert resp.status_code == 422
        finally:
            await client.aclose()
            await engine.dispose()
