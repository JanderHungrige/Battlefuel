"""Seed fuel depots and their stock for the demo (Wave 5 Feature 1: fuel-supply-model).

Idempotent **reset** (insert ON CONFLICT DO UPDATE), matching ``instance_seed``: re-seeding
restores each depot's canonical position and each stock row's canonical quantity/capacity, so
buy/refuel tests and the live sim start from a known state. Depot cells are best-effort tagged
``situation = supply_point`` so the OF-8 overlay and tile inspector show them as supply points.
"""

from __future__ import annotations

import h3
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.unit import FuelType
from app.models.supply import FuelDepotRow, FuelStockRow
from app.services.tile_grid import DEFAULT_RESOLUTION

# Depots sit in the deep rear (west of the frontline, at/inside REAR_LON_MAX) — see
# ``app.domain.frontline`` (v2 Wave 14). FARP North was previously east of the new front; pulled
# back into the western rear with the rest of the NATO logistics.
# (id, name, lat, lon)
SEED_DEPOTS: tuple[tuple[str, str, float, float], ...] = (
    ("depot-main", "Main Supply Point", 49.212, 11.800),
    ("depot-north", "FARP North", 49.248, 11.808),
)

# (depot_id, fuel_type, quantity_liters, capacity_liters)
SEED_STOCKS: tuple[tuple[str, FuelType, float, float], ...] = (
    ("depot-main", FuelType.DIESEL, 60000.0, 80000.0),
    ("depot-main", FuelType.JP8, 8000.0, 20000.0),
    ("depot-north", FuelType.DIESEL, 18000.0, 40000.0),
)


async def seed_fuel_supply(session: AsyncSession) -> int:
    """Insert the demo depots + stock. Returns the number of depots processed."""
    depot_rows = [
        {
            "id": depot_id,
            "name": name,
            "h3_index": h3.latlng_to_cell(lat, lon, DEFAULT_RESOLUTION),
            "lat": lat,
            "lon": lon,
        }
        for depot_id, name, lat, lon in SEED_DEPOTS
    ]
    depot_insert = pg_insert(FuelDepotRow).values(depot_rows)
    await session.execute(
        depot_insert.on_conflict_do_update(
            index_elements=["id"],
            set_={
                "name": depot_insert.excluded.name,
                "h3_index": depot_insert.excluded.h3_index,
                "lat": depot_insert.excluded.lat,
                "lon": depot_insert.excluded.lon,
            },
        )
    )

    stock_rows = [
        {
            "depot_id": depot_id,
            "fuel_type": fuel_type.value,
            "quantity_liters": quantity,
            "capacity_liters": capacity,
        }
        for depot_id, fuel_type, quantity, capacity in SEED_STOCKS
    ]
    stock_insert = pg_insert(FuelStockRow).values(stock_rows)
    await session.execute(
        stock_insert.on_conflict_do_update(
            index_elements=["depot_id", "fuel_type"],
            set_={
                "quantity_liters": stock_insert.excluded.quantity_liters,
                "capacity_liters": stock_insert.excluded.capacity_liters,
            },
        )
    )

    # Best-effort: tag each depot's tile as a supply point (no-op if the tile row is absent).
    await session.execute(
        text("UPDATE tiles SET situation = 'supply_point' WHERE h3_index = ANY(:cells)"),
        {"cells": [r["h3_index"] for r in depot_rows]},
    )

    await session.commit()
    return len(depot_rows)
