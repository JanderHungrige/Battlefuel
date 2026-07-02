"""Save and reload the hand-built scenario state (v2 Wave 22 F5, scenario-save-load).

``build_snapshot`` reads the current forces / depots / threats / obstacles into a
``ScenarioSnapshot``; ``restore_snapshot`` clears the live state and rebuilds it from a snapshot,
then re-annotates the routing graph so SAFE cost + danger reflect the loaded threats/enemies. The
CRUD helpers persist snapshots on the ``scenarios`` table by unique name.
"""

from __future__ import annotations

import uuid

import h3
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.scenario import (
    DepotSnap,
    EnemySnap,
    ObstacleSnap,
    ScenarioSnapshot,
    ScenarioSummary,
    StockSnap,
    ThreatSnap,
    UnitSnap,
)
from app.models.obstacle import ObstacleRow
from app.models.placed_enemy_unit import PlacedEnemyUnitRow
from app.models.scenario import ScenarioRow
from app.models.supply import FuelDepotRow, FuelStockRow
from app.models.unit_instance import UnitInstanceRow
from app.services.routing_graph import annotate_ways
from app.services.tile_grid import DEFAULT_RESOLUTION


async def build_snapshot(session: AsyncSession) -> ScenarioSnapshot:
    """Capture the current hand-built state into a snapshot."""
    units = [
        UnitSnap(
            unit_type_id=r.unit_type_id,
            name=r.name,
            lat=r.lat,
            lon=r.lon,
            status=r.status,
            current_fuel_liters=r.current_fuel_liters,
        )
        for r in (await session.execute(select(UnitInstanceRow))).scalars()
    ]
    enemies = [
        EnemySnap(name=r.name, sidc=r.sidc, lat=r.lat, lon=r.lon, echelon=r.echelon)
        for r in (await session.execute(select(PlacedEnemyUnitRow))).scalars()
    ]
    stocks_by_depot: dict[str, list[StockSnap]] = {}
    for r in (await session.execute(select(FuelStockRow))).scalars():
        stocks_by_depot.setdefault(r.depot_id, []).append(
            StockSnap(
                fuel_type=r.fuel_type,
                quantity_liters=r.quantity_liters,
                capacity_liters=r.capacity_liters,
            )
        )
    depots = [
        DepotSnap(
            name=r.name,
            lat=r.lat,
            lon=r.lon,
            site_type=r.site_type,
            stocks=stocks_by_depot.get(r.id, []),
        )
        for r in (await session.execute(select(FuelDepotRow))).scalars()
    ]
    threats = [
        ThreatSnap(h3_index=h3_index, threat_level=int(level))
        for h3_index, level in (
            await session.execute(
                text("SELECT h3_index, threat_level FROM tiles WHERE threat_level > 0")
            )
        ).all()
    ]
    obstacles = [
        ObstacleSnap(h3_index=r.h3_index, kind=r.kind)
        for r in (await session.execute(select(ObstacleRow))).scalars()
    ]
    return ScenarioSnapshot(
        units=units, enemies=enemies, depots=depots, threats=threats, obstacles=obstacles
    )


async def restore_snapshot(session: AsyncSession, snapshot: ScenarioSnapshot) -> None:
    """Replace the live state with ``snapshot``, then re-annotate the routing graph."""
    # Clear the current hand-built state.
    for model in (UnitInstanceRow, PlacedEnemyUnitRow, ObstacleRow, FuelStockRow, FuelDepotRow):
        await session.execute(delete(model))
    # A scenario is a fresh START state — clear in-flight orders that reference the old (now
    # deleted) units/depots so nothing dangles after the ids are regenerated.
    for table in ("move_orders", "refuel_orders", "rendezvous_orders", "buy_orders"):
        await session.execute(text(f"DELETE FROM {table}"))
    await session.execute(text("UPDATE tiles SET threat_level = 0, last_event = NULL"))

    # Rebuild from the snapshot.
    for u in snapshot.units:
        session.add(
            UnitInstanceRow(
                id=f"inst-{uuid.uuid4().hex[:12]}",
                name=u.name,
                unit_type_id=u.unit_type_id,
                lat=u.lat,
                lon=u.lon,
                h3_index=h3.latlng_to_cell(u.lat, u.lon, DEFAULT_RESOLUTION),
                status=u.status,
                current_fuel_liters=u.current_fuel_liters,
            )
        )
    for e in snapshot.enemies:
        session.add(
            PlacedEnemyUnitRow(
                id=f"enemy-{uuid.uuid4().hex[:12]}",
                name=e.name,
                sidc=e.sidc,
                lat=e.lat,
                lon=e.lon,
                echelon=e.echelon,
            )
        )
    for d in snapshot.depots:
        depot_id = f"depot-{uuid.uuid4().hex[:12]}"
        session.add(
            FuelDepotRow(
                id=depot_id,
                name=d.name,
                h3_index=h3.latlng_to_cell(d.lat, d.lon, DEFAULT_RESOLUTION),
                lat=d.lat,
                lon=d.lon,
                site_type=d.site_type,
            )
        )
        for s in d.stocks:
            session.add(
                FuelStockRow(
                    depot_id=depot_id,
                    fuel_type=s.fuel_type,
                    quantity_liters=s.quantity_liters,
                    capacity_liters=s.capacity_liters,
                )
            )
    for o in snapshot.obstacles:
        session.add(
            ObstacleRow(id=f"obs-{uuid.uuid4().hex[:12]}", h3_index=o.h3_index, kind=o.kind)
        )
    for tsnap in snapshot.threats:
        await session.execute(
            text("UPDATE tiles SET threat_level = :t WHERE h3_index = :h"),
            {"t": tsnap.threat_level, "h": tsnap.h3_index},
        )
    await session.commit()
    # Threats + enemies changed → re-cost the whole graph so SAFE routing + danger reflect the load.
    await annotate_ways(session)


async def save_scenario(session: AsyncSession, name: str) -> ScenarioSummary:
    """Snapshot the current state under ``name`` (overwriting a same-named scenario)."""
    snapshot = await build_snapshot(session)
    existing = (
        await session.execute(select(ScenarioRow).where(ScenarioRow.name == name))
    ).scalar_one_or_none()
    if existing is not None:
        existing.snapshot = snapshot.model_dump(mode="json")
        row = existing
    else:
        row = ScenarioRow(
            id=f"scn-{uuid.uuid4().hex[:12]}", name=name, snapshot=snapshot.model_dump(mode="json")
        )
        session.add(row)
    await session.commit()
    return ScenarioSummary(id=row.id, name=row.name, created_at=row.created_at)


async def list_scenarios(session: AsyncSession) -> list[ScenarioSummary]:
    """All saved scenarios, newest first."""
    rows = (
        await session.execute(select(ScenarioRow).order_by(ScenarioRow.created_at.desc()))
    ).scalars()
    return [ScenarioSummary(id=r.id, name=r.name, created_at=r.created_at) for r in rows]


async def load_scenario(session: AsyncSession, scenario_id: str) -> bool:
    """Restore the scenario ``scenario_id``. Returns False if the id is unknown."""
    row = await session.get(ScenarioRow, scenario_id)
    if row is None:
        return False
    await restore_snapshot(session, ScenarioSnapshot.model_validate(row.snapshot))
    return True


async def delete_scenario(session: AsyncSession, scenario_id: str) -> bool:
    """Delete a saved scenario. Returns False if the id is unknown."""
    result = await session.execute(
        delete(ScenarioRow).where(ScenarioRow.id == scenario_id).returning(ScenarioRow.id)
    )
    await session.commit()
    return result.first() is not None
