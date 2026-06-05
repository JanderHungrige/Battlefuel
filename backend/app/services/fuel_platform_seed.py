"""Seed the fuel-management platforms (v2 Wave 11 Feature 2: fuel-platform-selector).

Idempotent reset (insert ON CONFLICT DO UPDATE), matching the depot/stock seed: re-seeding
restores the canonical World Fuel DFMS (default) + Shell FM rows so the OF-8 platform selector
starts from a known state. ``logo_key`` is an asset slug the frontend maps to a committed logo.
"""

from __future__ import annotations

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.fuel_platform import FuelPlatformRow

# (id, name, logo_key, is_default)
SEED_PLATFORMS: tuple[tuple[str, str, str | None, bool], ...] = (
    ("platform-world-fuel-dfms", "World Fuel DFMS", "world-fuel", True),
    ("platform-shell-fm", "Shell FM", "shell-fm", False),
)


async def seed_fuel_platforms(session: AsyncSession) -> int:
    """Insert (or reset) the demo fuel platforms. Returns the number processed."""
    rows = [
        {"id": pid, "name": name, "logo_key": logo_key, "is_default": is_default}
        for pid, name, logo_key, is_default in SEED_PLATFORMS
    ]
    stmt = pg_insert(FuelPlatformRow).values(rows)
    await session.execute(
        stmt.on_conflict_do_update(
            index_elements=["id"],
            set_={
                "name": stmt.excluded.name,
                "logo_key": stmt.excluded.logo_key,
                "is_default": stmt.excluded.is_default,
            },
        )
    )
    await session.commit()
    return len(rows)
