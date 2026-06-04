"""Enemy-unit endpoint (v2 Wave 3, enemy-red-nato-units). Mounted under /api/v1.

Serves the read-only seeded hostile force for red APP-6 rendering. In-memory (no DB) — the provider
returns the stub directly; the source is swappable via the factory.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.domain.enemy_unit import EnemyUnit
from app.providers.enemy_units import EnemyUnitProvider, build_enemy_unit_provider

router = APIRouter(tags=["enemy-units"])


def get_enemy_unit_provider() -> EnemyUnitProvider:
    """FastAPI dependency: build the configured enemy-unit provider (overridable in tests)."""
    return build_enemy_unit_provider()


EnemyUnitProviderDep = Annotated[EnemyUnitProvider, Depends(get_enemy_unit_provider)]


@router.get("/enemy-units")
async def list_enemy_units(provider: EnemyUnitProviderDep) -> list[EnemyUnit]:
    """List all placed enemy units (red APP-6 hostile symbols)."""
    return list(provider.units())
