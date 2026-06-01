"""Tests for the DB/spatial foundation (Wave 2 Feature 1: db-spatial-foundation)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import pytest
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

from app.config import Settings
from app.db import Base, get_engine, get_session_maker


class TestWiring:
    """Unit-level checks that need no database connection."""

    def test_default_database_url_is_async_postgres(self) -> None:
        assert Settings().database_url.startswith("postgresql+asyncpg://")

    def test_base_has_metadata(self) -> None:
        assert hasattr(Base, "metadata")

    def test_engine_is_singleton(self) -> None:
        assert get_engine() is get_engine()

    def test_session_maker_is_singleton(self) -> None:
        assert get_session_maker() is get_session_maker()


@asynccontextmanager
async def _connect() -> AsyncIterator[AsyncConnection]:
    """Yield a connection from a fresh engine, or skip if the DB is unreachable.

    A per-test engine avoids reusing an asyncpg connection across the function-scoped
    event loops that pytest-asyncio creates.
    """
    engine = create_async_engine(Settings().database_url)
    try:
        conn = await engine.connect()
    except SQLAlchemyError as exc:
        await engine.dispose()
        pytest.skip(f"database unavailable: {exc}")
    try:
        yield conn
    finally:
        await conn.close()
        await engine.dispose()


@pytest.mark.db
class TestPostgisIntegration:
    """Requires a running PostGIS (docker compose up db) with migrations applied."""

    async def test_postgis_extension_enabled(self) -> None:
        async with _connect() as conn:
            row = (
                await conn.execute(
                    text("SELECT extname FROM pg_extension WHERE extname = 'postgis'")
                )
            ).first()
            assert row is not None, "postgis extension missing — run alembic upgrade head"

    async def test_postgis_version_query(self) -> None:
        async with _connect() as conn:
            version = (await conn.execute(text("SELECT postgis_version()"))).scalar_one()
            assert isinstance(version, str) and version
