"""Tests for buy orders (Wave 5 Feature 4: buy-orders)."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings
from app.db import get_session
from app.domain.buy_order import BuyOrderStatus
from app.domain.unit import FuelType
from app.main import create_app
from app.providers.buy_orders import (
    DbBuyOrderProvider,
    UnknownBuyOrderProviderError,
    build_buy_order_provider,
)
from app.providers.supply import build_supply_provider
from app.services.buy_service import advance_buy_order, deliver_due_buy_orders
from app.services.supply_seed import seed_fuel_supply


class TestCountdown:
    def test_decrements(self) -> None:
        remaining, delivered = advance_buy_order(remaining_game_s=100.0, dt_game_s=30.0)
        assert remaining == 70.0
        assert delivered is False

    def test_delivers_at_zero(self) -> None:
        remaining, delivered = advance_buy_order(remaining_game_s=20.0, dt_game_s=30.0)
        assert remaining == 0.0
        assert delivered is True

    def test_exactly_zero_delivers(self) -> None:
        remaining, delivered = advance_buy_order(remaining_game_s=30.0, dt_game_s=30.0)
        assert remaining == 0.0
        assert delivered is True


class TestFactory:
    def test_build_db(self) -> None:
        assert isinstance(
            build_buy_order_provider(Settings(buy_order_provider="db")), DbBuyOrderProvider
        )

    def test_unknown_raises(self) -> None:
        with pytest.raises(UnknownBuyOrderProviderError):
            build_buy_order_provider(Settings(buy_order_provider="nope"))


async def _client() -> tuple[AsyncClient, object, async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(Settings().database_url)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        await seed_fuel_supply(session)
        await session.execute(text("DELETE FROM buy_orders"))
        await session.commit()

    async def _override() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = _override
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test"), engine, maker


@pytest.mark.db
class TestBuyOrderApi:
    async def test_create_confirm_cancel(self) -> None:
        try:
            client, engine, _ = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            body = {"depot_id": "depot-main", "fuel_type": "diesel", "quantity_liters": 5000}
            created = await client.post("/api/v1/buy-orders", json=body)
            assert created.status_code == 201
            order = created.json()
            assert order["status"] == "pending"
            assert order["remaining_game_s"] == order["lead_time_game_s"]
            oid = order["id"]

            confirmed = await client.post(f"/api/v1/buy-orders/{oid}/confirm")
            assert confirmed.json()["status"] == "active"
            cancelled = await client.post(f"/api/v1/buy-orders/{oid}/cancel")
            assert cancelled.json()["status"] == "cancelled"
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_order_mask_metadata_persists(self) -> None:
        # v2 Wave 11 F3: platform / inform flags / destination are persisted on the order.
        try:
            client, engine, _ = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            body = {
                "depot_id": "depot-main",
                "fuel_type": "diesel",
                "quantity_liters": 5000,
                "platform_id": "platform-world-fuel-dfms",
                "inform_jlsg": True,
                "inform_jtf": False,
                "destination_name": "Main Supply Point",
            }
            order = (await client.post("/api/v1/buy-orders", json=body)).json()
            assert order["platform_id"] == "platform-world-fuel-dfms"
            assert order["inform_jlsg"] is True
            assert order["inform_jtf"] is False
            assert order["destination_name"] == "Main Supply Point"

            # The metadata survives a re-fetch (persisted, not just echoed).
            again = (await client.get(f"/api/v1/buy-orders/{order['id']}")).json()
            assert again["platform_id"] == "platform-world-fuel-dfms"
            assert again["inform_jlsg"] is True
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_destination_name_defaults_to_depot_name(self) -> None:
        try:
            client, engine, _ = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            body = {"depot_id": "depot-main", "fuel_type": "diesel", "quantity_liters": 100}
            order = (await client.post("/api/v1/buy-orders", json=body)).json()
            assert order["destination_name"] == "Main Supply Point"
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_unknown_depot_404(self) -> None:
        try:
            client, engine, _ = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            body = {"depot_id": "nope", "fuel_type": "diesel", "quantity_liters": 100}
            assert (await client.post("/api/v1/buy-orders", json=body)).status_code == 404
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_depot_without_stock_row_422(self) -> None:
        try:
            client, engine, _ = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            # depot-north stocks only diesel, not jp8.
            body = {"depot_id": "depot-north", "fuel_type": "jp8", "quantity_liters": 100}
            assert (await client.post("/api/v1/buy-orders", json=body)).status_code == 422
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_delivery_increases_depot_stock(self) -> None:
        try:
            client, engine, maker = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            supply = build_supply_provider()
            async with maker() as s:
                before = (await supply.get_stock(s, "depot-main", FuelType.DIESEL)).quantity_liters

            body = {
                "depot_id": "depot-main",
                "fuel_type": "diesel",
                "quantity_liters": 5000,
                "lead_time_game_s": 10,
            }
            oid = (await client.post("/api/v1/buy-orders", json=body)).json()["id"]
            await client.post(f"/api/v1/buy-orders/{oid}/confirm")

            orders = build_buy_order_provider()
            async with maker() as s:
                # One big tick past the lead time delivers it.
                delivered = await deliver_due_buy_orders(s, supply, orders, dt_game_s=999.0)
            assert len(delivered) == 1

            async with maker() as s:
                after = (await supply.get_stock(s, "depot-main", FuelType.DIESEL)).quantity_liters
                order = await orders.get(s, oid)
            assert order.status is BuyOrderStatus.DELIVERED
            assert after == before + 5000
        finally:
            await client.aclose()
            await engine.dispose()
