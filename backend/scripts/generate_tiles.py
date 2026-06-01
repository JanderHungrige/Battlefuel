"""Populate the tiles table for the seed theater and derive terrain from OSM.

Run after migrations and import_osm_to_postgis.sh:
    .venv/bin/python scripts/generate_tiles.py
"""

from __future__ import annotations

import asyncio

from app.db import get_session_maker
from app.services.tile_seed import generate_and_store_tiles


async def main() -> None:
    async with get_session_maker()() as session:
        count = await generate_and_store_tiles(session)
        print(f"Generated/seeded {count} tiles.")


if __name__ == "__main__":
    asyncio.run(main())
