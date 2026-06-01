"""Obstacle providers and factory (Wave 4, manual-obstacles).

Same swap-point philosophy as the other providers: consumers depend on ``ObstacleProvider``
and obtain one via ``build_obstacle_provider()``. Wave 4 ships a PostgreSQL-backed provider.
"""

from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from collections.abc import Callable, Sequence

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.domain.obstacle import Obstacle
from app.models.obstacle import ObstacleRow


def _to_obstacle(row: ObstacleRow) -> Obstacle:
    return Obstacle(id=row.id, h3_index=row.h3_index, kind=row.kind)


class ObstacleProvider(ABC):
    @abstractmethod
    async def create(self, session: AsyncSession, h3_index: str, kind: str = "manual") -> Obstacle:
        """Persist an obstacle blocking ``h3_index`` and return it."""

    @abstractmethod
    async def list_all(self, session: AsyncSession) -> Sequence[Obstacle]:
        """Return all obstacles."""

    @abstractmethod
    async def delete(self, session: AsyncSession, obstacle_id: str) -> bool:
        """Delete an obstacle; return True if one was removed."""


class DbObstacleProvider(ObstacleProvider):
    async def create(self, session: AsyncSession, h3_index: str, kind: str = "manual") -> Obstacle:
        row = ObstacleRow(id=uuid.uuid4().hex, h3_index=h3_index, kind=kind)
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return _to_obstacle(row)

    async def list_all(self, session: AsyncSession) -> Sequence[Obstacle]:
        rows = (await session.execute(select(ObstacleRow))).scalars().all()
        return [_to_obstacle(r) for r in rows]

    async def delete(self, session: AsyncSession, obstacle_id: str) -> bool:
        result = await session.execute(
            delete(ObstacleRow).where(ObstacleRow.id == obstacle_id).returning(ObstacleRow.id)
        )
        await session.commit()
        return result.first() is not None


ObstacleProviderBuilder = Callable[[], ObstacleProvider]
_REGISTRY: dict[str, ObstacleProviderBuilder] = {}


class UnknownObstacleProviderError(ValueError):
    """Raised when config names an obstacle provider that is not registered."""


def register_obstacle_provider(name: str, builder: ObstacleProviderBuilder) -> None:
    _REGISTRY[name] = builder


def build_obstacle_provider(settings: Settings | None = None) -> ObstacleProvider:
    settings = settings or get_settings()
    try:
        builder = _REGISTRY[settings.obstacle_provider]
    except KeyError as exc:
        raise UnknownObstacleProviderError(
            f"unknown obstacle provider {settings.obstacle_provider!r}; "
            f"available: {sorted(_REGISTRY)}"
        ) from exc
    return builder()


register_obstacle_provider("db", DbObstacleProvider)
