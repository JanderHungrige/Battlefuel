"""CSV-backed combat-event catalog provider (v2 Wave 4)."""

from __future__ import annotations

import csv
import re
from abc import ABC, abstractmethod
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

from app.config import Settings, get_settings


@dataclass(frozen=True)
class CombatEventCatalogItem:
    """One normalized row from the Wave-4 combat-event CSV catalog."""

    id: str
    category: str
    event: str
    threat_level: int
    supply_relevant: bool


class CombatEventCatalogProvider(ABC):
    @abstractmethod
    def items(self) -> Sequence[CombatEventCatalogItem]:
        """All catalog rows available for event scheduling."""


_REQUIRED_CATALOG_COLUMNS = ("Category", "Event", "Threat Level", "Supply Relevant")
_SLUG_RE = re.compile(r"[^a-z0-9]+")


class CombatEventCatalogError(ValueError):
    """Raised when the combat-event catalog cannot be loaded or normalized."""


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _resolve_catalog_path(path: str | Path) -> Path:
    p = Path(path)
    if p.is_absolute():
        return p
    if p.exists():
        return p
    return _repo_root() / p


def _slug(text: str) -> str:
    slug = _SLUG_RE.sub("-", text.lower()).strip("-")
    return slug or "event"


def _field(row: dict[str, str], name: str, line_no: int) -> str:
    value = row.get(name, "").strip()
    if not value:
        raise CombatEventCatalogError(f"combat event catalog row {line_no}: missing {name!r}")
    return value


def _threat_level(value: str, line_no: int) -> int:
    try:
        level = int(value)
    except ValueError as exc:
        raise CombatEventCatalogError(
            f"combat event catalog row {line_no}: invalid Threat Level {value!r}"
        ) from exc
    if not 0 <= level <= 5:
        raise CombatEventCatalogError(
            f"combat event catalog row {line_no}: Threat Level must be 0..5"
        )
    return level


def _supply_relevant(value: str, line_no: int) -> bool:
    normalized = value.strip().lower()
    if normalized in {"yes", "true", "1", "y", "supply"}:
        return True
    if normalized in {"no", "false", "0", "n"}:
        return False
    raise CombatEventCatalogError(
        f"combat event catalog row {line_no}: invalid Supply Relevant {value!r}"
    )


class CsvCombatEventCatalogProvider(CombatEventCatalogProvider):
    """CSV-backed Wave-4 event catalog provider."""

    def __init__(self, path: str | Path) -> None:
        self._path = _resolve_catalog_path(path)

    def items(self) -> Sequence[CombatEventCatalogItem]:
        with self._path.open(newline="", encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            fieldnames = tuple(reader.fieldnames or ())
            missing = [c for c in _REQUIRED_CATALOG_COLUMNS if c not in fieldnames]
            if missing:
                raise CombatEventCatalogError(
                    f"combat event catalog missing columns: {', '.join(missing)}"
                )
            items: list[CombatEventCatalogItem] = []
            for line_no, row in enumerate(reader, start=2):
                category = _field(row, "Category", line_no)
                event = _field(row, "Event", line_no)
                threat = _threat_level(_field(row, "Threat Level", line_no), line_no)
                supply = _supply_relevant(_field(row, "Supply Relevant", line_no), line_no)
                row_id = f"{line_no - 1:03d}-{_slug(category)}-{_slug(event)}"
                items.append(
                    CombatEventCatalogItem(
                        id=row_id,
                        category=category,
                        event=event,
                        threat_level=threat,
                        supply_relevant=supply,
                    )
                )
        return tuple(items)


class NoneCombatEventCatalogProvider(CombatEventCatalogProvider):
    def items(self) -> Sequence[CombatEventCatalogItem]:
        return ()


CombatEventCatalogBuilder = Callable[[Settings], CombatEventCatalogProvider]
_CATALOG_REGISTRY: dict[str, CombatEventCatalogBuilder] = {}


class UnknownCombatEventCatalogProviderError(ValueError):
    """Raised when config names a combat-event-catalog provider that is not registered."""


def register_combat_event_catalog_provider(
    name: str, builder: CombatEventCatalogBuilder
) -> None:
    _CATALOG_REGISTRY[name] = builder


def build_combat_event_catalog_provider(
    settings: Settings | None = None,
) -> CombatEventCatalogProvider:
    settings = settings or get_settings()
    try:
        builder = _CATALOG_REGISTRY[settings.combat_event_catalog_provider]
    except KeyError as exc:
        raise UnknownCombatEventCatalogProviderError(
            f"unknown combat event catalog provider {settings.combat_event_catalog_provider!r}; "
            f"available: {sorted(_CATALOG_REGISTRY)}"
        ) from exc
    return builder(settings)


register_combat_event_catalog_provider(
    "csv_catalog",
    lambda settings: CsvCombatEventCatalogProvider(settings.combat_event_catalog_path),
)
register_combat_event_catalog_provider("none", lambda _settings: NoneCombatEventCatalogProvider())
