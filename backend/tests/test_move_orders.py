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
