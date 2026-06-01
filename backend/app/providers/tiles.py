"""Tile data providers and their factory (Feature 3).

Same swap-point philosophy as the unit factory: consumers depend on the
``TileDataProvider`` interface and obtain one via ``build_tile_provider()``. Wave 2 ships
a PostgreSQL-backed provider; an alternate source can register under its own name later.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.domain.theater import BBox
from app.domain.tile import (
    Cover,
    IntelLevel,
    RoadCondition,
    TerrainType,
    Tile,
    Weather,
)
from app.models.tile import TileRow


class TileDataProvider(ABC):
    """Read access to map tiles."""

    @abstractmethod
    async def list_tiles(self, session: AsyncSession, bbox: BBox | None = None) -> Sequence[Tile]:
        """Return all tiles, optionally limited to those whose center is inside ``bbox``."""

    @abstractmethod
    async def get_tile(self, session: AsyncSession, h3_index: str) -> Tile | None:
        """Return a single tile by H3 index, or ``None``."""


def _to_tile(row: TileRow) -> Tile:
    return Tile(
        h3_index=row.h3_index,
        resolution=row.resolution,
        center_lat=row.center_lat,
        center_lon=row.center_lon,
        terrain=TerrainType(row.terrain),
        threat_level=row.threat_level,
        intel_level=IntelLevel(row.intel_level),
        weather=Weather(row.weather),
        road_condition=RoadCondition(row.road_condition),
        cover=Cover(row.cover),
        boundary=Tile.boundary_for(row.h3_index),
    )


class DbTileProvider(TileDataProvider):
    """Serves tiles from the ``tiles`` table."""

    async def list_tiles(self, session: AsyncSession, bbox: BBox | None = None) -> Sequence[Tile]:
        stmt = select(TileRow)
        if bbox is not None:
            stmt = stmt.where(
                TileRow.center_lon >= bbox.west,
                TileRow.center_lon <= bbox.east,
                TileRow.center_lat >= bbox.south,
                TileRow.center_lat <= bbox.north,
            )
        rows = (await session.execute(stmt)).scalars().all()
        return [_to_tile(r) for r in rows]

    async def get_tile(self, session: AsyncSession, h3_index: str) -> Tile | None:
        row = await session.get(TileRow, h3_index)
        return _to_tile(row) if row is not None else None


TileProviderBuilder = Callable[[], TileDataProvider]
_REGISTRY: dict[str, TileProviderBuilder] = {}


class UnknownTileProviderError(ValueError):
    """Raised when config names a tile provider that is not registered."""


def register_tile_provider(name: str, builder: TileProviderBuilder) -> None:
    _REGISTRY[name] = builder


def build_tile_provider(settings: Settings | None = None) -> TileDataProvider:
    settings = settings or get_settings()
    try:
        builder = _REGISTRY[settings.tile_provider]
    except KeyError as exc:
        raise UnknownTileProviderError(
            f"unknown tile provider {settings.tile_provider!r}; available: {sorted(_REGISTRY)}"
        ) from exc
    return builder()


register_tile_provider("db", DbTileProvider)
