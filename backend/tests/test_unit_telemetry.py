"""Tests for the manual telemetry-update endpoint (Wave 5 Feature 8: unit-overview-telemetry)."""

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


async def _client() -> tuple[AsyncClient, object]:
    engine = create_async_engine(Settings().database_url)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        await seed_unit_instances(session)

    async def _override() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = _override
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test"), engine


@pytest.mark.db
class TestTelemetryUpdate:
    async def test_sets_fuel_on_no_telemetry_unit(self) -> None:
        try:
            client, engine = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            # inst-recon-1 is seeded with current_fuel_liters = None (no telemetry).
            before = (await client.get("/api/v1/unit-instances/inst-recon-1")).json()
            assert before["current_fuel_liters"] is None

            resp = await client.post(
                "/api/v1/unit-instances/inst-recon-1/telemetry",
                json={"current_fuel_liters": 1234.0},
            )
            assert resp.status_code == 200
            assert resp.json()["current_fuel_liters"] == 1234.0

            after = (await client.get("/api/v1/unit-instances/inst-recon-1")).json()
            assert after["current_fuel_liters"] == 1234.0
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_unknown_unit_404(self) -> None:
        try:
            client, engine = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            resp = await client.post(
                "/api/v1/unit-instances/nope/telemetry", json={"current_fuel_liters": 1.0}
            )
            assert resp.status_code == 404
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_negative_fuel_rejected(self) -> None:
        try:
            client, engine = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            resp = await client.post(
                "/api/v1/unit-instances/inst-recon-1/telemetry",
                json={"current_fuel_liters": -5.0},
            )
            assert resp.status_code == 422
        finally:
            await client.aclose()
            await engine.dispose()
