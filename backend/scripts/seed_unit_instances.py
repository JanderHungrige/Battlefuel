"""Seed demo unit instances into the theater.

Run after migrations:
    .venv/bin/python scripts/seed_unit_instances.py
"""

from __future__ import annotations

import asyncio

from app.db import get_session_maker
from app.services.instance_seed import seed_unit_instances


async def main() -> None:
    async with get_session_maker()() as session:
        count = await seed_unit_instances(session)
        print(f"Seeded {count} unit instances.")


if __name__ == "__main__":
    asyncio.run(main())
