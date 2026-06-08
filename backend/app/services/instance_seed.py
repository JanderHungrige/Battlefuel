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

# NATO holds the WEST of the irregular frontline (see ``app.domain.frontline``). Combat units sit
# FORWARD (just west of the front, spread N-S); HQ + the fuel trucks sit in the REAR (deep west,
# at/inside ``REAR_LON_MAX``). Positions are derived from ``frontline_lon`` so the whole force moves
# with the front if the control points change; ``test_frontline`` re-derives and verifies
# the west/forward/rear relationship (v2 Wave 14, frontline-theater-layout).
# (id, callsign, unit_type_id, lat, lon, status, current_fuel_liters | None)
SEED_PLACEMENTS: tuple[tuple[str, str, str, float, float, str, float | None], ...] = (
    # Forward combat line (west of the front), north to south:
    ("inst-recon-1", "HAWK", "recon-troop", 49.255, 11.8356, "degraded", None),
    ("inst-mech-2", "COBRA", "mech-inf-coy", 49.240, 11.830, "operational", 6500.0),
    ("inst-armor-1", "TIGER", "armor-tank-coy", 49.230, 11.839, "operational", 15000.0),
    ("inst-armor-2", "LION", "armor-tank-coy", 49.218, 11.8394, "operational", 14000.0),
    ("inst-mech-1", "VIPER", "mech-inf-coy", 49.205, 11.829, "operational", 7000.0),
    ("inst-inf-1", "FALCON", "inf-coy", 49.192, 11.8394, "operational", 3000.0),
    # Rear echelon (deep west): HQ + the OF-8 fuel-supply fleet.
    ("inst-hq", "HQ ANVIL", "hq-bn-main", 49.225, 11.805, "operational", 2000.0),
    ("inst-fuel-1", "TANKER", "fuel-supply-pl", 49.232, 11.812, "operational", 3800.0),
    ("inst-fuel-2", "BOWSER", "fuel-supply-pl", 49.215, 11.814, "operational", 4000.0),
    ("inst-fuel-3", "CISTERN", "fuel-supply-pl", 49.200, 11.810, "operational", 1500.0),
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
