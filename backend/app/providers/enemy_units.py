"""Enemy-unit provider (v2 Wave 3, enemy-red-nato-units).

A swappable source of placed hostile units. ``seed`` ships a small illustrative Hohenfels stub
(rendered red via APP-6 hostile SIDCs); ``none`` disables it (tests/CI / clean demos). Mirrors the
established provider/registry/factory pattern so the source can later become chatter-driven (Wave 4)
or scenario-defined (Wave 7) without touching render code.

Hostile SIDC = ``1006`` (version 10, context 0, **affiliation 6 = hostile**) + ``1000`` (land-unit
set, status 0, HQ/dummy 0) + echelon(2) + entity(6) + ``0000`` — the friendly seed builder with the
affiliation digit flipped from 3 to 6.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable, Sequence

from app.config import Settings, get_settings
from app.domain.combat_event import CombatEvent
from app.domain.enemy_unit import EnemyUnit


class EnemyUnitProvider(ABC):
    @abstractmethod
    def units(self) -> Sequence[EnemyUnit]:
        """All placed enemy units."""


# Illustrative hostile force holding the EAST of the irregular frontline (see
# ``app.domain.frontline``): each unit sits east of ``frontline_lon`` at its latitude, with the
# recon screen forward (closest to the front) and the heavier mech/armor deeper east (v2 Wave 14).
_SEED: tuple[EnemyUnit, ...] = (
    EnemyUnit(
        id="enemy-mech-1",
        name="OPFOR MECH 1",
        sidc="10061000151211020000",  # mechanized infantry, company
        lat=49.238,
        lon=11.865,
        echelon="company",
    ),
    EnemyUnit(
        id="enemy-armor-1",
        name="OPFOR ARMOR 1",
        sidc="10061000141205000000",  # armor, platoon
        lat=49.250,
        lon=11.8588,
        echelon="platoon",
    ),
    EnemyUnit(
        id="enemy-recon-1",
        name="OPFOR RECON 1",
        sidc="10061000131606000000",  # reconnaissance, section
        lat=49.222,
        lon=11.8676,
        echelon="section",
    ),
)


class SeededEnemyUnitProvider(EnemyUnitProvider):
    def units(self) -> Sequence[EnemyUnit]:
        return _SEED


class NoneEnemyUnitProvider(EnemyUnitProvider):
    def units(self) -> Sequence[EnemyUnit]:
        return ()


_dynamic_units: dict[str, EnemyUnit] = {}


def register_dynamic_enemy_sighting(
    event_id: str,
    name: str,
    sidc: str,
    lat: float,
    lon: float,
    echelon: str | None = None,
) -> None:
    """Register or update a dynamic enemy unit sighting from a combat event."""
    _dynamic_units[event_id] = EnemyUnit(
        id=event_id,
        name=name,
        sidc=sidc,
        lat=lat,
        lon=lon,
        echelon=echelon,
    )


def clear_dynamic_enemy_sightings() -> None:
    """Clear all dynamic enemy sightings. Useful for testing/re-init."""
    _dynamic_units.clear()


class ChatterEnemyUnitProvider(EnemyUnitProvider):
    """Hostile force derived from incoming chatter / combat events (v2 Wave 4)."""

    def units(self) -> Sequence[EnemyUnit]:
        return tuple(_dynamic_units.values())


EnemyUnitBuilder = Callable[[], EnemyUnitProvider]
_REGISTRY: dict[str, EnemyUnitBuilder] = {}


class UnknownEnemyUnitProviderError(ValueError):
    """Raised when config names an enemy-unit provider that is not registered."""


def register_enemy_unit_provider(name: str, builder: EnemyUnitBuilder) -> None:
    _REGISTRY[name] = builder


def build_enemy_unit_provider(settings: Settings | None = None) -> EnemyUnitProvider:
    settings = settings or get_settings()
    try:
        builder = _REGISTRY[settings.enemy_unit_provider]
    except KeyError as exc:
        raise UnknownEnemyUnitProviderError(
            f"unknown enemy unit provider {settings.enemy_unit_provider!r}; "
            f"available: {sorted(_REGISTRY)}"
        ) from exc
    return builder()


register_enemy_unit_provider("seed", SeededEnemyUnitProvider)
register_enemy_unit_provider("none", NoneEnemyUnitProvider)
register_enemy_unit_provider("chatter", ChatterEnemyUnitProvider)


_SIGHTING_KEYWORDS = ("spotted", "contact", "identified", "sniper", "ambush", "adversary", "opfor")


def is_enemy_sighting(category: str, event: str) -> bool:
    e = event.lower()
    cat = category.lower()
    return any(k in e for k in _SIGHTING_KEYWORDS) or cat == "adversary activity"


def map_enemy_sighting(category: str, event: str) -> tuple[str, str, str | None]:
    e = event.lower()
    name = event
    if "logistics" in e or "supply" in e:
        sidc = "10061000141214000000"
        echelon = "platoon"
    elif "c2" in e or "command" in e:
        sidc = "10061000141212000000"
        echelon = "platoon"
    elif "recon" in e or "spotted" in e:
        sidc = "10061000131606000000"
        echelon = "section"
    elif "sniper" in e:
        sidc = "10061000111204000000"
        echelon = "section"
    else:
        sidc = "10061000141211020000"
        echelon = "platoon"
    return name, sidc, echelon


def register_dynamic_enemy_sighting_from_event(ev: CombatEvent) -> None:
    if is_enemy_sighting(ev.category, ev.event):
        name, sidc, echelon = map_enemy_sighting(ev.category, ev.event)
        event_id = ev.catalog_id if ev.catalog_id else ev.id
        register_dynamic_enemy_sighting(
            event_id=event_id,
            name=name,
            sidc=sidc,
            lat=ev.lat,
            lon=ev.lon,
            echelon=echelon,
        )
