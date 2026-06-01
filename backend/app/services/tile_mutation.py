"""Apply a runtime tile mutation and re-cost the affected graph cell (Wave 4,
dynamic-tile-updates).

Orchestrates: write the tile row (via the tile provider), then re-annotate the edges in that
H3 cell so routing and the sim immediately see the change. Returns the updated tile; the
caller broadcasts the ``tile_update`` frame.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.tile import Tile, TileMutation
from app.providers.tiles import TileDataProvider
from app.services.routing_graph import annotate_cell


async def apply_tile_mutation(
    session: AsyncSession,
    tiles: TileDataProvider,
    h3_index: str,
    mutation: TileMutation,
) -> Tile | None:
    """Mutate a tile and re-cost its cell's edges. Returns the updated tile, or None if absent."""
    tile = await tiles.update_tile(session, h3_index, mutation)
    if tile is None:
        return None
    await annotate_cell(session, h3_index)
    return tile


def tile_update_frame(tile: Tile) -> dict[str, object]:
    """The ``tile_update`` WebSocket frame for a changed tile."""
    return {
        "type": "tile_update",
        "h3_index": tile.h3_index,
        "terrain": tile.terrain.value,
        "threat_level": tile.threat_level,
        "road_condition": tile.road_condition.value,
        "intel_level": tile.intel_level.value,
        "weather": tile.weather.value,
        "cover": tile.cover.value,
        "situation": tile.situation.value if tile.situation else None,
        "note": tile.note,
    }
