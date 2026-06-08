"""Tests for fuel-management platforms (v2 Wave 11 Feature 2: fuel-platform-selector)."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings
from app.db import get_session
from app.domain.fuel_platform import platform_id_from_name
from app.main import create_app
from app.providers.fuel_platforms import (
    DbFuelPlatformProvider,
    UnknownFuelPlatformProviderError,
    build_fuel_platform_provider,
)
from app.services.fuel_platform_seed import seed_fuel_platforms


class TestSlug:
    def test_basic(self) -> None:
        assert platform_id_from_name("World Fuel DFMS") == "platform-world-fuel-dfms"

    def test_collapses_punctuation_and_trims(self) -> None:
        assert platform_id_from_name("  Shell  FM!! ") == "platform-shell-fm"

    def test_empty_name(self) -> None:
        assert platform_id_from_name("   ") == "platform-unnamed"


class TestFactory:
    def test_build_db(self) -> None:
        assert isinstance(
            build_fuel_platform_provider(Settings(fuel_platform_provider="db")),
            DbFuelPlatformProvider,
        )

    def test_unknown_raises(self) -> None:
        with pytest.raises(UnknownFuelPlatformProviderError):
            build_fuel_platform_provider(Settings(fuel_platform_provider="nope"))


async def _client() -> tuple[AsyncClient, object, async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(Settings().database_url)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        await session.execute(text("DELETE FROM fuel_platforms"))
        await session.commit()
        await seed_fuel_platforms(session)

    async def _override() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = _override
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test"), engine, maker


@pytest.mark.db
class TestFuelPlatformApi:
    async def test_list_default_first(self) -> None:
        client, engine, _ = await _client()
        try:
            res = await client.get("/api/v1/fuel-platforms")
            assert res.status_code == 200
            data = res.json()
            assert [p["name"] for p in data] == ["World Fuel DFMS", "Shell FM"]
            assert data[0]["is_default"] is True
            assert data[0]["logo_key"] == "world-fuel"
            assert data[1]["is_default"] is False
        finally:
            await client.aclose()
            await engine.dispose()  # type: ignore[attr-defined]

    async def test_create_appends_and_is_idempotent(self) -> None:
        client, engine, _ = await _client()
        try:
            created = await client.post(
                "/api/v1/fuel-platforms", json={"name": "NATO Fuel Cell"}
            )
            assert created.status_code == 201
            body = created.json()
            assert body["id"] == "platform-nato-fuel-cell"
            assert body["is_default"] is False
            assert body["logo_key"] is None

            # Re-adding the same name returns the existing row (no duplicate / no error).
            again = await client.post("/api/v1/fuel-platforms", json={"name": "NATO Fuel Cell"})
            assert again.status_code == 201
            assert again.json()["id"] == body["id"]

            listed = (await client.get("/api/v1/fuel-platforms")).json()
            ids = [p["id"] for p in listed]
            assert ids.count("platform-nato-fuel-cell") == 1
        finally:
            await client.aclose()
            await engine.dispose()  # type: ignore[attr-defined]
