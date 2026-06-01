"""Tests for the strategic support feed (Wave 5 Feature 7: strategic-support-chatter)."""

from __future__ import annotations

import pytest

from app.config import Settings
from app.providers.strategic_feed import (
    NoneStrategicFeedProvider,
    ScriptedStrategicFeedProvider,
    StrategicEvent,
    UnknownStrategicFeedProviderError,
    build_strategic_feed_provider,
    due_strategic,
)


class TestDueStrategic:
    def test_fires_in_window_only(self) -> None:
        events = [
            StrategicEvent(50.0, "convoy inbound", "logistics"),
            StrategicEvent(150.0, "depot resupply", "logistics"),
        ]
        fired = due_strategic(events, prev_s=40.0, now_s=100.0)
        assert [e.text for e in fired] == ["convoy inbound"]

    def test_boundary_inclusive_upper(self) -> None:
        events = [StrategicEvent(100.0, "msg", "info")]
        assert due_strategic(events, 50.0, 100.0) == events
        assert due_strategic(events, 100.0, 150.0) == []


class TestStrategicFeedFactory:
    def test_scripted_has_events(self) -> None:
        provider = build_strategic_feed_provider(Settings(strategic_feed_provider="scripted"))
        assert isinstance(provider, ScriptedStrategicFeedProvider)
        assert len(provider.events()) >= 1

    def test_none_is_empty(self) -> None:
        provider = build_strategic_feed_provider(Settings(strategic_feed_provider="none"))
        assert isinstance(provider, NoneStrategicFeedProvider)
        assert provider.events() == ()

    def test_unknown_raises(self) -> None:
        with pytest.raises(UnknownStrategicFeedProviderError):
            build_strategic_feed_provider(Settings(strategic_feed_provider="nope"))
