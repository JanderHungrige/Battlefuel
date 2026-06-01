"""Annotate the routing `ways` table with tile threat + safe_cost.

Run by build_routing_graph.sh after osm2pgrouting, or standalone:
    .venv/bin/python scripts/annotate_routing.py
"""

from __future__ import annotations

import asyncio

from app.db import get_session_maker
from app.services.routing_graph import annotate_ways


async def main() -> None:
    async with get_session_maker()() as session:
        count = await annotate_ways(session)
        print(f"Annotated {count} ways.")


if __name__ == "__main__":
    asyncio.run(main())
