"""Seed demo fuel depots + stock and fuel-management platforms into the theater.

Run after migrations:
    .venv/bin/python scripts/seed_supply.py
"""

from __future__ import annotations

import asyncio

from app.db import get_session_maker
from app.services.fuel_platform_seed import seed_fuel_platforms
from app.services.supply_seed import seed_fuel_supply


async def main() -> None:
    async with get_session_maker()() as session:
        count = await seed_fuel_supply(session)
        platforms = await seed_fuel_platforms(session)
        print(f"Seeded {count} fuel depots and {platforms} fuel platforms.")


if __name__ == "__main__":
    asyncio.run(main())
