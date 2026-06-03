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
from app.domain.enemy_unit import EnemyUnit


class EnemyUnitProvider(ABC):
    @abstractmethod
    def units(self) -> Sequence[EnemyUnit]:
        """All placed enemy units."""


# Illustrative hostile force around the Hohenfels theater.
_SEED: tuple[EnemyUnit, ...] = (
    EnemyUnit(
        id="enemy-mech-1",
        name="OPFOR MECH 1",
        sidc="10061000151211020000",  # mechanized infantry, company
        lat=49.236,
        lon=11.872,
        echelon="company",
    ),
    EnemyUnit(
        id="enemy-armor-1",
        name="OPFOR ARMOR 1",
        sidc="10061000141205000000",  # armor, platoon
        lat=49.248,
        lon=11.858,
        echelon="platoon",
    ),
    EnemyUnit(
        id="enemy-recon-1",
        name="OPFOR RECON 1",
        sidc="10061000131606000000",  # reconnaissance, section
        lat=49.221,
        lon=11.889,
        echelon="section",
    ),
)


class SeededEnemyUnitProvider(EnemyUnitProvider):
    def units(self) -> Sequence[EnemyUnit]:
        return _SEED


class NoneEnemyUnitProvider(EnemyUnitProvider):
    def units(self) -> Sequence[EnemyUnit]:
        return ()


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
