"""Tests for the scripted tile feed + TileMutation (Wave 4 dynamic-tile-updates)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.domain.tile import RoadCondition, TileMutation
from app.providers.tile_feed import (
    FeedEvent,
    NoneTileFeedProvider,
    ScriptedTileFeedProvider,
    build_tile_feed_provider,
    due_events,
)


class TestTileMutation:
    def test_changes_returns_only_set_fields_as_values(self) -> None:
        m = TileMutation(threat_level=3, road_condition=RoadCondition.DAMAGED)
        assert m.changes() == {"threat_level": 3, "road_condition": "damaged"}

    def test_empty_mutation_has_no_changes(self) -> None:
        assert TileMutation().changes() == {}

    def test_situation_and_note_changes(self) -> None:
        from app.domain.tile import SectorSituation

        m = TileMutation(situation=SectorSituation.UNDER_FIRE, note="taking fire from ridge")
        assert m.changes() == {"situation": "under_fire", "note": "taking fire from ridge"}

    def test_threat_out_of_range_rejected(self) -> None:
        with pytest.raises(ValidationError):
            TileMutation(threat_level=9)

    def test_unknown_field_rejected(self) -> None:
        with pytest.raises(ValidationError):
            TileMutation(terrain="forest")  # type: ignore[call-arg]


class TestDueEvents:
    _EVENTS = (
        FeedEvent(90.0, 49.2, 11.8, TileMutation(threat_level=1)),
        FeedEvent(240.0, 49.2, 11.8, TileMutation(threat_level=2)),
    )

    def test_window_is_half_open_lower_exclusive_upper_inclusive(self) -> None:
        assert due_events(self._EVENTS, 0.0, 90.0) == [self._EVENTS[0]]
        assert due_events(self._EVENTS, 90.0, 100.0) == []  # 90 already fired
        assert due_events(self._EVENTS, 100.0, 240.0) == [self._EVENTS[1]]

    def test_each_event_fires_once_across_consecutive_ticks(self) -> None:
        fired = []
        prev = 0.0
        for now in (60.0, 120.0, 180.0, 300.0):
            fired += due_events(self._EVENTS, prev, now)
            prev = now
        assert fired == [self._EVENTS[0], self._EVENTS[1]]


class TestFeedFactory:
    def test_scripted_provider_has_a_schedule(self) -> None:
        events = build_tile_feed_provider(Settings(tile_feed_provider="scripted")).events()
        assert len(events) >= 1
        assert isinstance(build_tile_feed_provider(Settings(tile_feed_provider="scripted")),
                          ScriptedTileFeedProvider)

    def test_none_provider_is_empty(self) -> None:
        provider = build_tile_feed_provider(Settings(tile_feed_provider="none"))
        assert isinstance(provider, NoneTileFeedProvider)
        assert provider.events() == ()
