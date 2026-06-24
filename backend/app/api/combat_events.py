"""Combat-event catalog endpoints (v2 Wave 4). Mounted under /api/v1."""

from __future__ import annotations

from fastapi import APIRouter

from app.providers.combat_event_catalog import (
    CombatEventCatalogItem,
    build_combat_event_catalog_provider,
)

router = APIRouter(tags=["combat-events"])


@router.get("/combat-events/catalog")
async def get_combat_event_catalog() -> list[CombatEventCatalogItem]:
    """List all normalized rows from the combat event CSV catalog."""
    provider = build_combat_event_catalog_provider()
    return list(provider.items())
