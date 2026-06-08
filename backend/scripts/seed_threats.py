"""Reset tile threat levels to the initial East/West frontline pattern (v2 Wave 14).

Run after generate_tiles.py (tiles must exist) and before annotate_routing.py (the routing
graph's safe-cost reads tile threat):
    .venv/bin/python scripts/seed_threats.py
"""

from __future__ import annotations

import asyncio

from app.db import get_session_maker
from app.services.tile_seed import seed_frontline_threats


async def main() -> None:
    async with get_session_maker()() as session:
        count = await seed_frontline_threats(session)
        print(f"Seeded frontline threat levels on {count} tiles.")


if __name__ == "__main__":
    asyncio.run(main())
