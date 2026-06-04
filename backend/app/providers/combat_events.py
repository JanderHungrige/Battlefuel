"""Scripted located-combat-event feed (v2 Wave 3, located-event-model).

A swappable source of timed :class:`~app.domain.combat_event.CombatEvent`\\ s advanced by the sim
clock: each event fires once when game-time first passes its ``at_game_s``. Mirrors the Wave-4 tile
feed and Wave-5 strategic feed. ``scripted`` ships an illustrative Hohenfels schedule covering all
three colour zones; ``none`` disables it (tests/CI). The full ``combat_zone_events.csv`` catalog
load + configurable arrival rate are deferred to Wave 4; this feed is the minimal demo slice.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable, Sequence

from app.config import Settings, get_settings
from app.domain.combat_event import CombatEvent


def due_combat_events(
    events: Sequence[CombatEvent], prev_s: float, now_s: float
) -> list[CombatEvent]:
    """Events whose ``at_game_s`` falls in ``(prev_s, now_s]`` — fired exactly once."""
    return [e for e in events if prev_s < e.at_game_s <= now_s]


class CombatEventFeedProvider(ABC):
    @abstractmethod
    def events(self) -> Sequence[CombatEvent]:
        """All scheduled combat events (order irrelevant; filtered by ``due_combat_events``)."""


# Illustrative located-threat schedule over the Hohenfels theater (game-seconds from sim start).
# Spans every EventZone: blocked/100 m (IED), combat/1 km (RED route, air strike),
# threat/2 km (hostile spotted, air threat), blocked/1 km (chokepoint).
_SCRIPTED: tuple[CombatEvent, ...] = (
    CombatEvent(
        id="ied-msr-7",
        at_game_s=20.0,
        category="Threat Events",
        event="IED / mine detected or detonated",
        lat=49.215,
        lon=11.835,
        estimated_threat=4,
        sender="EOD 4-1 (52nd EOD)",
    ),
    CombatEvent(
        id="red-route-north",
        at_game_s=50.0,
        category="Movement & Access",
        event="Route classified RED (under fire / contested)",
        lat=49.228,
        lon=11.862,
        estimated_threat=5,
        sender="RECON 2-7 (1-4 CAV)",
    ),
    CombatEvent(
        id="hostile-hill-12",
        at_game_s=85.0,
        category="Threat Events",
        event="Hostile unit spotted / identified",
        lat=49.240,
        lon=11.845,
        estimated_threat=3,
        sender="DRONE FEED (RQ-7 SHADOW)",
    ),
    CombatEvent(
        id="air-threat-west",
        at_game_s=120.0,
        category="Threat Events",
        event="Air threat detected (drone/fixed-wing/helo)",
        lat=49.200,
        lon=11.820,
        estimated_threat=4,
        sender="SIGINT (513th MI)",
    ),
    CombatEvent(
        id="chokepoint-ford",
        at_game_s=160.0,
        category="Movement & Access",
        event="Chokepoint / bottleneck identified",
        lat=49.190,
        lon=11.880,
        estimated_threat=3,
        sender="HQ (3 ID TOC)",
    ),
    CombatEvent(
        id="airstrike-obj-bear",
        at_game_s=210.0,
        category="Engagements & Fires",
        event="Air strike delivered",
        lat=49.250,
        lon=11.870,
        estimated_threat=4,
        sender="FIRES (1-9 FA)",
    ),
)


class ScriptedCombatEventFeedProvider(CombatEventFeedProvider):
    def events(self) -> Sequence[CombatEvent]:
        return _SCRIPTED


class NoneCombatEventFeedProvider(CombatEventFeedProvider):
    def events(self) -> Sequence[CombatEvent]:
        return ()


CombatEventFeedBuilder = Callable[[], CombatEventFeedProvider]
_REGISTRY: dict[str, CombatEventFeedBuilder] = {}


class UnknownCombatEventFeedProviderError(ValueError):
    """Raised when config names a combat-event-feed provider that is not registered."""


def register_combat_event_feed_provider(name: str, builder: CombatEventFeedBuilder) -> None:
    _REGISTRY[name] = builder


def build_combat_event_feed_provider(
    settings: Settings | None = None,
) -> CombatEventFeedProvider:
    settings = settings or get_settings()
    try:
        builder = _REGISTRY[settings.combat_event_feed_provider]
    except KeyError as exc:
        raise UnknownCombatEventFeedProviderError(
            f"unknown combat event feed provider {settings.combat_event_feed_provider!r}; "
            f"available: {sorted(_REGISTRY)}"
        ) from exc
    return builder()


register_combat_event_feed_provider("scripted", ScriptedCombatEventFeedProvider)
register_combat_event_feed_provider("none", NoneCombatEventFeedProvider)
