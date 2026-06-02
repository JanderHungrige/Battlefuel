"""Reset sim-polluted road conditions, then re-annotate the routing graph (v2 Wave 1).

The live sim blocks/damages tiles over time (combat, road damage, minefields); after a long
session almost the whole theater can be ``blocked``, disconnecting the metric routing graph.
The router's distance fallback (Feature routing-bug-fix) keeps routes resolving, but for a
clean demo or test run this resets every tile's ``road_condition`` back to ``clear`` and
re-costs ``ways`` so the primary (threat-aware) graph is whole again.

    .venv/bin/python scripts/reset_road_conditions.py

Threat levels are left untouched (they decay/are managed by the event engine); only the
road-condition pollution that excludes edges from the graph is cleared.
"""

from __future__ import annotations

import asyncio

from sqlalchemy import text

from app.db import get_session_maker
from app.services.routing_graph import annotate_ways


async def main() -> None:
    async with get_session_maker()() as session:
        result = await session.execute(
            text("UPDATE tiles SET road_condition = 'clear' WHERE road_condition <> 'clear'")
        )
        await session.commit()
        reset = result.rowcount
        edges = await annotate_ways(session)
    print(f"Reset {reset} tile(s) to clear; re-annotated {edges} ways.")


if __name__ == "__main__":
    asyncio.run(main())
