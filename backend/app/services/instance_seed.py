"""Seed a small set of placed unit instances for the demo (Feature 4).

Idempotent **reset** (insert ON CONFLICT DO UPDATE): re-seeding restores each placement to
its canonical position/fuel/status, so the sim (which moves units and persists them) and
tests start from a known state. Each placement references a catalog ``UnitType`` id
(validated against the unit provider) and is positioned inside the Hohenfels theater. One
unit is left without telemetry (``current_fuel_liters = None``) to exercise the
"no data → request manual update" path.
"""

from __future__ import annotations

import h3
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

import app.providers  # noqa: F401  (ensures the seed unit provider is registered)
from app.models.unit_instance import UnitInstanceRow
from app.providers.factory import build_unit_provider
from app.services.tile_grid import DEFAULT_RESOLUTION

# (id, callsign, unit_type_id, lat, lon, status, current_fuel_liters | None)
SEED_PLACEMENTS: tuple[tuple[str, str, str, float, float, str, float | None], ...] = (
    ("inst-hq", "HQ ANVIL", "hq-bn-main", 49.220, 11.850, "operational", 2000.0),
    ("inst-armor-1", "TIGER", "armor-tank-coy", 49.232, 11.862, "operational", 15000.0),
    ("inst-mech-1", "VIPER", "mech-inf-coy", 49.211, 11.840, "operational", 7000.0),
    ("inst-recon-1", "HAWK", "recon-troop", 49.252, 11.885, "degraded", None),
    ("inst-fuel-1", "TANKER", "fuel-supply-pl", 49.201, 11.831, "operational", 3800.0),
)


async def seed_unit_instances(session: AsyncSession) -> int:
    """Insert the demo unit instances. Returns the number of placements processed."""
    valid_ids = {u.id for u in build_unit_provider().list_units()}
    rows = []
    for inst_id, name, type_id, lat, lon, status, fuel in SEED_PLACEMENTS:
        if type_id not in valid_ids:
            raise ValueError(f"placement {inst_id!r} references unknown unit type {type_id!r}")
        rows.append(
            {
                "id": inst_id,
                "name": name,
                "unit_type_id": type_id,
                "lat": lat,
                "lon": lon,
                "h3_index": h3.latlng_to_cell(lat, lon, DEFAULT_RESOLUTION),
                "status": status,
                "current_fuel_liters": fuel,
            }
        )
    insert = pg_insert(UnitInstanceRow).values(rows)
    stmt = insert.on_conflict_do_update(
        index_elements=["id"],
        set_={
            "name": insert.excluded.name,
            "unit_type_id": insert.excluded.unit_type_id,
            "lat": insert.excluded.lat,
            "lon": insert.excluded.lon,
            "h3_index": insert.excluded.h3_index,
            "status": insert.excluded.status,
            "current_fuel_liters": insert.excluded.current_fuel_liters,
        },
    )
    await session.execute(stmt)
    await session.commit()
    return len(rows)
