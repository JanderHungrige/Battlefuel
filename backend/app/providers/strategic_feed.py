"""Scripted strategic-support feed (Wave 5 Feature 7: strategic-support-chatter).

A swappable source of timed strategic messages for the OF-8 commander, advanced by the sim
clock: each :class:`StrategicEvent` fires once when game-time first passes its ``at_game_s``.
Mirrors the Wave-4 tile feed. ``scripted`` ships an illustrative schedule; ``none`` disables it.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from app.config import Settings, get_settings


@dataclass(frozen=True)
class StrategicEvent:
    """A scheduled strategic message, due at ``at_game_s`` of game-time."""

    at_game_s: float
    text: str
    category: str


def due_strategic(
    events: Sequence[StrategicEvent], prev_s: float, now_s: float
) -> list[StrategicEvent]:
    """Events whose ``at_game_s`` falls in ``(prev_s, now_s]`` — fired exactly once."""
    return [e for e in events if prev_s < e.at_game_s <= now_s]


class StrategicFeedProvider(ABC):
    @abstractmethod
    def events(self) -> Sequence[StrategicEvent]:
        """All scheduled strategic events (order irrelevant; filtered by ``due_strategic``)."""


# Illustrative joint-force support schedule (game-seconds from sim start).
_SCRIPTED: tuple[StrategicEvent, ...] = (
    StrategicEvent(
        60.0, "SUSTAINMENT: fuel convoy departing rear area for theater depots.", "logistics"
    ),
    StrategicEvent(
        180.0, "INTEL: interdiction expected on northern MSR — expect demand spikes.", "intel"
    ),
    StrategicEvent(
        360.0, "SUSTAINMENT: corps approves emergency fuel buy authority.", "logistics"
    ),
    StrategicEvent(
        600.0, "OPS: prioritize refuel of forward armor before next phase line.", "ops"
    ),
)


class ScriptedStrategicFeedProvider(StrategicFeedProvider):
    def events(self) -> Sequence[StrategicEvent]:
        return _SCRIPTED


class NoneStrategicFeedProvider(StrategicFeedProvider):
    def events(self) -> Sequence[StrategicEvent]:
        return ()


StrategicFeedBuilder = Callable[[], StrategicFeedProvider]
_REGISTRY: dict[str, StrategicFeedBuilder] = {}


class UnknownStrategicFeedProviderError(ValueError):
    """Raised when config names a strategic-feed provider that is not registered."""


def register_strategic_feed_provider(name: str, builder: StrategicFeedBuilder) -> None:
    _REGISTRY[name] = builder


def build_strategic_feed_provider(settings: Settings | None = None) -> StrategicFeedProvider:
    settings = settings or get_settings()
    try:
        builder = _REGISTRY[settings.strategic_feed_provider]
    except KeyError as exc:
        raise UnknownStrategicFeedProviderError(
            f"unknown strategic feed provider {settings.strategic_feed_provider!r}; "
            f"available: {sorted(_REGISTRY)}"
        ) from exc
    return builder()


register_strategic_feed_provider("scripted", ScriptedStrategicFeedProvider)
register_strategic_feed_provider("none", NoneStrategicFeedProvider)
