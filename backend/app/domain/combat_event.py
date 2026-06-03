"""Located, categorised, precision-tagged combat events (v2 Wave 3, located-event-model).

The first BattleFuel event that carries a real-world location *and* a category *and* a drawn
precision — the foundation the Wave-3 threat squares, hover icons, and MGRS-tagged chatter render
from. Unlike :mod:`app.services.event_engine` (which mutates a random H3 tile), a combat event is an
independent located-threat datum: it is classified into a drawn square size (``precision_m``) and a
colour ``zone`` by the central :func:`classify` lookup, then broadcast as a ``combat_event`` frame.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum

# Word-boundary match for IED / mine / mines / minefield — a plain ``"ied" in event`` substring
# test would wrongly fire on "ident**ified**" and "class**ified**".
_MINE_RE = re.compile(r"\b(ied|mine\w*)\b")


class EventZone(StrEnum):
    """Colour semantics for a combat event (Wave-3 decision: red=combat, light-yellow=blocked)."""

    COMBAT = "combat"  # active fighting / threat-5 → rendered red
    BLOCKED = "blocked"  # impassable / denied corridor → rendered light-yellow
    THREAT = "threat"  # graded threat → shaded by estimated_threat


@dataclass(frozen=True)
class CombatEvent:
    """A located, categorised combat event, due at ``at_game_s`` of game-time.

    ``precision_m`` is an optional override of the drawn MGRS-square side (metres); when ``None``
    the size is derived from the category/event by :func:`classify`. The zone is always
    classification-derived (it is a semantic, not a size).
    """

    id: str
    at_game_s: float
    category: str
    event: str
    lat: float
    lon: float
    estimated_threat: int
    sender: str
    precision_m: int | None = None


# Category-fallback drawn precision (metres) when no event-substring rule matches.
_CATEGORY_PRECISION_M: dict[str, int] = {
    "Threat Events": 1500,
    "Movement & Access": 1000,
    "Engagements & Fires": 1000,
    "Adversary Activity": 2000,
    "Intelligence & Information": 2000,
}


def classify(category: str, event: str, estimated_threat: int) -> tuple[int, EventZone]:
    """Map a catalog (category, event, threat) to a drawn square size + colour zone.

    Rules are checked in priority order; the first match wins. This is the single place to tune the
    Wave-3 threat symbology (the "category → precision table" decision).
    """
    e = event.lower()
    if _MINE_RE.search(e):  # IED / mine / minefield — impassable, finest grid
        return (100, EventZone.BLOCKED)
    if any(k in e for k in ("chokepoint", "ford", "loc (", "severed")):  # denied corridor
        return (1000, EventZone.BLOCKED)
    if estimated_threat >= 5 or any(
        k in e
        for k in (
            "route classified red",
            "under fire",
            "ambush",
            "vbied",
            "suicide",
            "air strike",
            "engagement",
            "troops in contact",
        )
    ):
        return (1000, EventZone.COMBAT)
    if any(k in e for k in ("air threat", "drone", "fixed-wing", "helo")):
        return (2000, EventZone.THREAT)
    if "hostile unit spotted" in e or "identified" in e:  # the "enemy spotted" 1-2 km case
        return (2000, EventZone.THREAT)
    return (_CATEGORY_PRECISION_M.get(category, 1000), EventZone.THREAT)


def combat_event_frame(ev: CombatEvent, now_s: float) -> dict[str, object]:
    """Build the ``combat_event`` WebSocket frame for ``ev`` at game-time ``now_s``.

    Runs :func:`classify`; an explicit ``ev.precision_m`` overrides the table's drawn size (the zone
    is always classification-derived). Field set is forward-compatible: Wave 4 may ADD fields.
    """
    precision_m, zone = classify(ev.category, ev.event, ev.estimated_threat)
    if ev.precision_m is not None:
        precision_m = ev.precision_m
    return {
        "type": "combat_event",
        "id": ev.id,
        "category": ev.category,
        "event": ev.event,
        "lat": ev.lat,
        "lon": ev.lon,
        "precision_m": precision_m,
        "estimated_threat": ev.estimated_threat,
        "sender": ev.sender,
        "zone": zone.value,
        "game_s": round(now_s, 1),
    }
