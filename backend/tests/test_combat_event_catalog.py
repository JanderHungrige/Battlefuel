"""Tests for the combat-event CSV catalog provider (kept after unify-threat-chatter: it feeds the
EventEngine and the F7 obstacle picker)."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.config import Settings
from app.providers.combat_event_catalog import (
    CsvCombatEventCatalogProvider,
    NoneCombatEventCatalogProvider,
    UnknownCombatEventCatalogProviderError,
    build_combat_event_catalog_provider,
)


def test_csv_catalog_loads_seed_file() -> None:
    provider = build_combat_event_catalog_provider(
        Settings(combat_event_catalog_provider="csv_catalog")
    )
    assert isinstance(provider, CsvCombatEventCatalogProvider)
    items = provider.items()
    assert len(items) >= 100
    first = items[0]
    assert first.id.startswith("001-intelligence-information-")
    assert first.category == "Intelligence & Information"
    assert first.event == "New HUMINT report received"
    assert first.threat_level == 2
    assert first.supply_relevant is False


def test_none_catalog_is_empty() -> None:
    provider = build_combat_event_catalog_provider(Settings(combat_event_catalog_provider="none"))
    assert isinstance(provider, NoneCombatEventCatalogProvider)
    assert provider.items() == ()


def test_unknown_catalog_provider_raises() -> None:
    with pytest.raises(UnknownCombatEventCatalogProviderError):
        build_combat_event_catalog_provider(Settings(combat_event_catalog_provider="nope"))


def test_malformed_catalog_row_raises_with_context(tmp_path: Path) -> None:
    csv_path = tmp_path / "bad.csv"
    csv_path.write_text(
        "Category,Event,Threat Level,Supply Relevant\nThreat Events,Missing threat,nope,YES\n",
        encoding="utf-8",
    )
    provider = CsvCombatEventCatalogProvider(csv_path)
    with pytest.raises(ValueError, match="row 2"):
        provider.items()
