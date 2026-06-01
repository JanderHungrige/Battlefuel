"""Seed demo fuel depots + stock into the theater.

Run after migrations:
    .venv/bin/python scripts/seed_supply.py
"""

from __future__ import annotations

import asyncio

from app.db import get_session_maker
from app.services.supply_seed import seed_fuel_supply


async def main() -> None:
    async with get_session_maker()() as session:
        count = await seed_fuel_supply(session)
        print(f"Seeded {count} fuel depots.")


if __name__ == "__main__":
    asyncio.run(main())
