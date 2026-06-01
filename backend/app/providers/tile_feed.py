"""Scripted "incoming sector info" feed (Wave 4, dynamic-tile-updates).

A swappable source of timed tile mutations advanced by the sim clock: each ``FeedEvent``
fires once when game-time first passes its ``at_game_s``. The default ``scripted`` provider
ships an illustrative Hohenfels schedule; ``none`` disables the feed (tests/CI). Coordinates
are resolved to the containing H3 cell at apply time, so the seed needs no hardcoded indices.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from app.config import Settings, get_settings
from app.domain.tile import IntelLevel, RoadCondition, TileMutation


@dataclass(frozen=True)
class FeedEvent:
    """A scheduled tile mutation at a lat/lon, due at ``at_game_s`` of game-time."""

    at_game_s: float
    lat: float
    lon: float
    mutation: TileMutation


def due_events(events: Sequence[FeedEvent], prev_s: float, now_s: float) -> list[FeedEvent]:
    """Events whose ``at_game_s`` falls in ``(prev_s, now_s]`` — fired exactly once."""
    return [e for e in events if prev_s < e.at_game_s <= now_s]


class TileFeedProvider(ABC):
    @abstractmethod
    def events(self) -> Sequence[FeedEvent]:
        """All scheduled feed events (order irrelevant; filtered by ``due_events``)."""


# Illustrative schedule over the Hohenfels theater (game-seconds from sim start).
_SCRIPTED: tuple[FeedEvent, ...] = (
    FeedEvent(90.0, 49.205, 11.840, TileMutation(road_condition=RoadCondition.DAMAGED)),
    FeedEvent(240.0, 49.230, 11.860, TileMutation(threat_level=4)),
    FeedEvent(480.0, 49.220, 11.850, TileMutation(threat_level=2, intel_level=IntelLevel.HIGH)),
)


class ScriptedTileFeedProvider(TileFeedProvider):
    def events(self) -> Sequence[FeedEvent]:
        return _SCRIPTED


class NoneTileFeedProvider(TileFeedProvider):
    def events(self) -> Sequence[FeedEvent]:
        return ()


TileFeedBuilder = Callable[[], TileFeedProvider]
_REGISTRY: dict[str, TileFeedBuilder] = {}


class UnknownTileFeedProviderError(ValueError):
    """Raised when config names a tile-feed provider that is not registered."""


def register_tile_feed_provider(name: str, builder: TileFeedBuilder) -> None:
    _REGISTRY[name] = builder


def build_tile_feed_provider(settings: Settings | None = None) -> TileFeedProvider:
    settings = settings or get_settings()
    try:
        builder = _REGISTRY[settings.tile_feed_provider]
    except KeyError as exc:
        raise UnknownTileFeedProviderError(
            f"unknown tile feed provider {settings.tile_feed_provider!r}; "
            f"available: {sorted(_REGISTRY)}"
        ) from exc
    return builder()


register_tile_feed_provider("scripted", ScriptedTileFeedProvider)
register_tile_feed_provider("none", NoneTileFeedProvider)
