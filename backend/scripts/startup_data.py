"""Idempotent data setup run on backend startup (v2 Wave 16).

Invoked by the container command after ``alembic upgrade head`` and before uvicorn, so a deploy
(``docker compose up -d`` of a new image) automatically gets the DB into a usable, correctly-costed
state — no manual reseed/annotate. Two steps, both safe to run on every (re)start:

* **annotate the routing graph** if it exists — re-costs ``ways`` from the current tile threat +
  the enemy danger circles (Wave 16). Idempotent; does NOT touch game state (unit positions, tile
  threat), so it never resets a running scenario. This is what makes routing-cost changes
  zero-touch on deploy.
* **seed only if the DB is empty** (first boot) — tiles/units/supply + the frontline threat. Skips
  entirely once seeded, so a restart never wipes an in-progress scenario. Seed-data *changes*
  (e.g. moving units) still use ``deploy/reseed-stack.sh`` deliberately.

Best-effort: any failure is logged and swallowed so a data hiccup never blocks the API from
starting (the heavy one-time OSM import + routing-graph build stay in ``prod-bootstrap.sh``).
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session_maker

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("startup_data")


async def _tiles_count(session: AsyncSession) -> int:
    return int((await session.execute(text("SELECT count(*) FROM tiles"))).scalar_one())


async def _ways_count(session: AsyncSession) -> int:
    """Edge count, or 0 if the routing graph hasn't been built (table absent)."""
    if (await session.execute(text("SELECT to_regclass('public.ways')"))).scalar_one() is None:
        return 0
    return int((await session.execute(text("SELECT count(*) FROM ways"))).scalar_one())


async def _seed_if_empty(session: AsyncSession) -> None:
    from app.services.instance_seed import seed_unit_instances
    from app.services.supply_seed import seed_fuel_supply
    from app.services.tile_seed import generate_and_store_tiles, seed_frontline_threats

    if await _tiles_count(session) > 0:
        logger.info("startup_data: tiles present — skipping seed (state preserved)")
        return
    logger.info("startup_data: empty DB — seeding tiles/threats/units/supply")
    await generate_and_store_tiles(session)
    await seed_frontline_threats(session)
    await seed_unit_instances(session)
    await seed_fuel_supply(session)


async def _annotate_if_graph(session: AsyncSession) -> None:
    from app.services.routing_graph import annotate_ways

    if await _ways_count(session) == 0:
        logger.info("startup_data: no routing graph yet — skipping annotate")
        return
    n = await annotate_ways(session)
    logger.info("startup_data: annotated %d ways (tile threat + enemy circles)", n)


async def main() -> None:
    maker = get_session_maker()
    try:
        async with maker() as session:
            await _seed_if_empty(session)
        async with maker() as session:
            await _annotate_if_graph(session)
    except Exception:  # never block the API from starting on a data hiccup
        logger.exception("startup_data: data setup failed (continuing to serve)")


if __name__ == "__main__":
    asyncio.run(main())
