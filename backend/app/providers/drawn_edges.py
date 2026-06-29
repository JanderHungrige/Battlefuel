"""Drawn-edge providers and factory (v2 Wave 20 F4, connect-drawn-to-graph).

Same swap-point philosophy as the other providers: consumers depend on ``DrawnEdgeProvider`` and
obtain one via ``build_drawn_edge_provider()``. Wave 20 ships a PostgreSQL-backed provider.
"""

from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from collections.abc import Callable, Sequence

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.domain.drawn_edge import DrawnEdge
from app.models.drawn_edge import DrawnEdgeRow


def _to_domain(row: DrawnEdgeRow) -> DrawnEdge:
    return DrawnEdge(
        id=row.id,
        kind=row.kind,
        coordinates=[[float(x), float(y)] for x, y in row.coordinates],
        connect_start=row.connect_start,
        connect_end=row.connect_end,
    )


class DrawnEdgeProvider(ABC):
    @abstractmethod
    async def create(
        self,
        session: AsyncSession,
        kind: str,
        coordinates: list[list[float]],
        *,
        connect_start: bool,
        connect_end: bool,
    ) -> DrawnEdge:
        """Persist a drawn edge and return it."""

    @abstractmethod
    async def list_all(self, session: AsyncSession) -> Sequence[DrawnEdge]:
        """Return all drawn edges."""

    @abstractmethod
    async def delete(self, session: AsyncSession, edge_id: str) -> bool:
        """Delete a drawn edge; return True if one was removed."""


class DbDrawnEdgeProvider(DrawnEdgeProvider):
    async def create(
        self,
        session: AsyncSession,
        kind: str,
        coordinates: list[list[float]],
        *,
        connect_start: bool,
        connect_end: bool,
    ) -> DrawnEdge:
        row = DrawnEdgeRow(
            id=uuid.uuid4().hex,
            kind=kind,
            coordinates=coordinates,
            connect_start=connect_start,
            connect_end=connect_end,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return _to_domain(row)

    async def list_all(self, session: AsyncSession) -> Sequence[DrawnEdge]:
        rows = (await session.execute(select(DrawnEdgeRow))).scalars().all()
        return [_to_domain(r) for r in rows]

    async def delete(self, session: AsyncSession, edge_id: str) -> bool:
        result = await session.execute(
            delete(DrawnEdgeRow).where(DrawnEdgeRow.id == edge_id).returning(DrawnEdgeRow.id)
        )
        await session.commit()
        return result.first() is not None


DrawnEdgeProviderBuilder = Callable[[], DrawnEdgeProvider]
_REGISTRY: dict[str, DrawnEdgeProviderBuilder] = {}


class UnknownDrawnEdgeProviderError(ValueError):
    """Raised when config names a drawn-edge provider that is not registered."""


def register_drawn_edge_provider(name: str, builder: DrawnEdgeProviderBuilder) -> None:
    _REGISTRY[name] = builder


def build_drawn_edge_provider(settings: Settings | None = None) -> DrawnEdgeProvider:
    settings = settings or get_settings()
    try:
        builder = _REGISTRY[settings.drawn_edge_provider]
    except KeyError as exc:
        raise UnknownDrawnEdgeProviderError(
            f"unknown drawn-edge provider {settings.drawn_edge_provider!r}; "
            f"available: {sorted(_REGISTRY)}"
        ) from exc
    return builder()


register_drawn_edge_provider("db", DbDrawnEdgeProvider)
