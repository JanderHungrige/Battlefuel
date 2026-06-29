"""DB store for operator-placed red forces (v2 Wave 22 F1, scenario-force-placement).

Persisted hostiles placed via the scenario creator. Kept separate from the in-memory seed/chatter
enemy providers (``providers.enemy_units``): those model the canned demo OPFOR and transient
chatter sightings, while these are durable, operator-authored placements that survive reload, feed
SAFE routing + the Wave 21 danger circles, and are snapshotted by save/load (F5). Plain async
functions over the ORM — no factory needed (there is one source: the table).
"""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enemy_unit import EnemyUnit
from app.models.placed_enemy_unit import PlacedEnemyUnitRow


def _to_enemy(row: PlacedEnemyUnitRow) -> EnemyUnit:
    return EnemyUnit(
        id=row.id, name=row.name, sidc=row.sidc, lat=row.lat, lon=row.lon, echelon=row.echelon
    )


async def list_placed_enemy_units(session: AsyncSession) -> list[EnemyUnit]:
    """All operator-placed red forces."""
    rows = (await session.execute(select(PlacedEnemyUnitRow))).scalars().all()
    return [_to_enemy(r) for r in rows]


async def create_placed_enemy_unit(session: AsyncSession, unit: EnemyUnit) -> EnemyUnit:
    """Persist a placed red force. Returns the stored unit."""
    session.add(
        PlacedEnemyUnitRow(
            id=unit.id,
            name=unit.name,
            sidc=unit.sidc,
            lat=unit.lat,
            lon=unit.lon,
            echelon=unit.echelon,
        )
    )
    await session.commit()
    return unit


async def delete_placed_enemy_unit(session: AsyncSession, unit_id: str) -> bool:
    """Remove a placed red force. True if one was deleted, False if the id was unknown."""
    result = await session.execute(
        delete(PlacedEnemyUnitRow)
        .where(PlacedEnemyUnitRow.id == unit_id)
        .returning(PlacedEnemyUnitRow.id)
    )
    await session.commit()
    return result.first() is not None
