from __future__ import annotations

from app.config import Settings
from app.domain.combat_event import CombatEvent
from app.providers.combat_events import (
    CatalogCombatEventFeedProvider,
    build_combat_event_feed_provider,
)
from app.providers.enemy_units import (
    build_enemy_unit_provider,
    clear_dynamic_enemy_sightings,
    register_dynamic_enemy_sighting_from_event,
)


def test_catalog_feed_provider_factory() -> None:
    settings = Settings(combat_event_feed_provider="catalog")
    provider = build_combat_event_feed_provider(settings)
    assert isinstance(provider, CatalogCombatEventFeedProvider)


def test_catalog_feed_provider_scheduling() -> None:
    settings = Settings(
        combat_event_feed_provider="catalog",
        combat_event_mean_interval_game_s=600.0,
        combat_event_seed=100,
    )
    provider = build_combat_event_feed_provider(settings)
    events = provider.events()
    assert len(events) >= 100

    # First event should start at one interval (600s)
    first = events[0]
    assert first.at_game_s == 600.0
    assert first.catalog_id is not None
    assert first.supply_relevant is not None

    # Next events should be spaced by interval
    second = events[1]
    assert second.at_game_s == 1200.0


def test_catalog_feed_provider_deterministic_location() -> None:
    settings = Settings(
        combat_event_feed_provider="catalog",
        combat_event_seed=42,
    )
    provider1 = build_combat_event_feed_provider(settings)
    provider2 = build_combat_event_feed_provider(settings)

    ev1 = provider1.events()[0]
    ev2 = provider2.events()[0]

    assert ev1.lat == ev2.lat
    assert ev1.lon == ev2.lon


def test_dynamic_enemy_unit_sightings() -> None:
    clear_dynamic_enemy_sightings()

    # 1. Non-sighting event does not trigger sighting
    non_sighting = CombatEvent(
        id="test-1",
        at_game_s=100.0,
        category="Environment & Civil",
        event="Weather update",
        lat=49.200,
        lon=11.800,
        estimated_threat=1,
        sender="MET",
        supply_relevant=False,
    )
    register_dynamic_enemy_sighting_from_event(non_sighting)
    provider = build_enemy_unit_provider(Settings(enemy_unit_provider="chatter"))
    assert len(provider.units()) == 0

    # 2. Sighting event registers new enemy unit
    sighting = CombatEvent(
        id="test-2",
        at_game_s=150.0,
        category="Threat Events",
        event="Hostile unit spotted / identified",
        lat=49.200,
        lon=11.800,
        estimated_threat=3,
        sender="RECON",
        catalog_id="catalog-012",
        supply_relevant=False,
    )
    register_dynamic_enemy_sighting_from_event(sighting)
    units = provider.units()
    assert len(units) == 1
    assert units[0].id == "catalog-012"
    assert units[0].lat == 49.200
    assert units[0].lon == 11.800

    # 3. Repeat sighting with updated coordinates modifies existing unit
    sighting_updated = CombatEvent(
        id="test-3",
        at_game_s=200.0,
        category="Threat Events",
        event="Hostile unit spotted / identified",
        lat=49.250,
        lon=11.850,
        estimated_threat=4,
        sender="RECON",
        catalog_id="catalog-012",
        supply_relevant=False,
    )
    register_dynamic_enemy_sighting_from_event(sighting_updated)
    units_updated = provider.units()
    assert len(units_updated) == 1
    assert units_updated[0].id == "catalog-012"
    assert units_updated[0].lat == 49.250
    assert units_updated[0].lon == 11.850
