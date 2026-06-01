"""Database access: the SQLAlchemy declarative base, async engine, and session factory.

Engine/session are lazily created singletons so importing this module never opens a
connection (tests and tooling can import freely). All ORM models inherit from ``Base``;
Alembic uses ``Base.metadata`` for migrations.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings


class Base(DeclarativeBase):
    """Declarative base shared by every ORM model."""


_engine: AsyncEngine | None = None
_session_maker: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    """Return the process-wide async engine, creating it on first use."""
    global _engine
    if _engine is None:
        _engine = create_async_engine(get_settings().database_url, pool_pre_ping=True)
    return _engine


def get_session_maker() -> async_sessionmaker[AsyncSession]:
    """Return the process-wide async session factory."""
    global _session_maker
    if _session_maker is None:
        _session_maker = async_sessionmaker(get_engine(), expire_on_commit=False)
    return _session_maker


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency yielding an :class:`AsyncSession` (one per request)."""
    async with get_session_maker()() as session:
        yield session
