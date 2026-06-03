"""Tests for the located combat-event model + feed (v2 Wave 3, located-event-model)."""

from __future__ import annotations

from typing import Any

import pytest

from app.api.ws import ConnectionManager
from app.config import Settings
from app.domain.combat_event import (
    CombatEvent,
    EventZone,
    classify,
    combat_event_frame,
)
from app.providers.combat_events import (
    NoneCombatEventFeedProvider,
    ScriptedCombatEventFeedProvider,
    UnknownCombatEventFeedProviderError,
    build_combat_event_feed_provider,
    due_combat_events,
)
from app.services.sim_runner import SimEngine


class _FakeWS:
    def __init__(self) -> None:
        self.messages: list[dict[str, Any]] = []

    async def accept(self) -> None:
        pass

    async def send_json(self, message: dict[str, Any]) -> None:
        self.messages.append(message)


def _event(**kw: object) -> CombatEvent:
    base: dict[str, object] = {
        "id": "x",
        "at_game_s": 10.0,
        "category": "Threat Events",
        "event": "Hostile unit spotted / identified",
        "lat": 49.2,
        "lon": 11.85,
        "estimated_threat": 3,
        "sender": "HQ (3 ID TOC)",
    }
    base.update(kw)
    return CombatEvent(**base)  # type: ignore[arg-type]


class TestClassify:
    def test_ied_is_blocked_at_100m(self) -> None:
        assert classify("Threat Events", "IED / mine detected or detonated", 4) == (
            100,
            EventZone.BLOCKED,
        )

    def test_minefield_is_blocked_at_100m_even_at_threat_5(self) -> None:
        # The mine rule wins over the threat>=5 combat rule.
        assert classify("Movement & Access", "Minefield confirmed on MSR", 5) == (
            100,
            EventZone.BLOCKED,
        )

    def test_red_route_is_combat_at_1km(self) -> None:
        assert classify(
            "Movement & Access", "Route classified RED (under fire / contested)", 5
        ) == (1000, EventZone.COMBAT)

    def test_chokepoint_is_blocked_corridor(self) -> None:
        assert classify("Movement & Access", "Chokepoint / bottleneck identified", 3) == (
            1000,
            EventZone.BLOCKED,
        )

    def test_air_threat_is_graded_threat_at_2km(self) -> None:
        assert classify(
            "Threat Events", "Air threat detected (drone/fixed-wing/helo)", 4
        ) == (2000, EventZone.THREAT)

    def test_hostile_spotted_is_threat_at_2km(self) -> None:
        assert classify("Threat Events", "Hostile unit spotted / identified", 3) == (
            2000,
            EventZone.THREAT,
        )

    def test_threat_5_engagement_is_combat(self) -> None:
        assert classify("Engagements & Fires", "Air strike delivered", 4)[1] is EventZone.COMBAT

    def test_unknown_category_falls_back_to_threat_1km(self) -> None:
        assert classify("Weird Category", "something benign", 1) == (1000, EventZone.THREAT)


class TestCombatEventFrame:
    def test_frame_shape_and_derived_fields(self) -> None:
        frame = combat_event_frame(_event(id="ied-1", event="IED detected", at_game_s=20.0), 20.04)
        assert frame == {
            "type": "combat_event",
            "id": "ied-1",
            "category": "Threat Events",
            "event": "IED detected",
            "lat": 49.2,
            "lon": 11.85,
            "precision_m": 100,
            "estimated_threat": 3,
            "sender": "HQ (3 ID TOC)",
            "zone": "blocked",
            "game_s": 20.0,
        }

    def test_precision_override_keeps_classified_zone(self) -> None:
        # Override the drawn size but the zone stays classification-derived (blocked for a mine).
        frame = combat_event_frame(_event(event="mine detected", precision_m=500), 5.0)
        assert frame["precision_m"] == 500
        assert frame["zone"] == "blocked"


class TestDueCombatEvents:
    def test_fires_in_window_only(self) -> None:
        events = [_event(id="a", at_game_s=50.0), _event(id="b", at_game_s=150.0)]
        fired = due_combat_events(events, prev_s=40.0, now_s=100.0)
        assert [e.id for e in fired] == ["a"]

    def test_boundary_inclusive_upper_exclusive_lower(self) -> None:
        events = [_event(id="a", at_game_s=100.0)]
        assert [e.id for e in due_combat_events(events, 50.0, 100.0)] == ["a"]
        assert due_combat_events(events, 100.0, 150.0) == []


class TestCombatEventFeedFactory:
    def test_scripted_covers_all_three_zones(self) -> None:
        provider = build_combat_event_feed_provider(
            Settings(combat_event_feed_provider="scripted")
        )
        assert isinstance(provider, ScriptedCombatEventFeedProvider)
        zones = {classify(e.category, e.event, e.estimated_threat)[1] for e in provider.events()}
        assert zones == {EventZone.COMBAT, EventZone.BLOCKED, EventZone.THREAT}

    def test_scripted_ids_are_unique(self) -> None:
        provider = build_combat_event_feed_provider(
            Settings(combat_event_feed_provider="scripted")
        )
        ids = [e.id for e in provider.events()]
        assert len(ids) == len(set(ids))

    def test_none_is_empty(self) -> None:
        provider = build_combat_event_feed_provider(Settings(combat_event_feed_provider="none"))
        assert isinstance(provider, NoneCombatEventFeedProvider)
        assert provider.events() == ()

    def test_unknown_raises(self) -> None:
        with pytest.raises(UnknownCombatEventFeedProviderError):
            build_combat_event_feed_provider(Settings(combat_event_feed_provider="nope"))


class TestApplyCombatFeed:
    async def test_broadcasts_due_combat_event_frames(self) -> None:
        mgr = ConnectionManager()
        ws = _FakeWS()
        await mgr.connect(ws)  # type: ignore[arg-type]
        engine = SimEngine(mgr)
        provider = ScriptedCombatEventFeedProvider()

        # First scripted event fires at 20.0s; window (0, 25] should emit exactly one frame.
        sent = await engine.apply_combat_feed(provider, prev_s=0.0, now_s=25.0)

        assert sent == 1
        assert len(ws.messages) == 1
        frame = ws.messages[0]
        assert frame["type"] == "combat_event"
        assert frame["zone"] == "blocked"  # the seeded IED event
        assert frame["precision_m"] == 100

    async def test_quiet_window_sends_nothing(self) -> None:
        mgr = ConnectionManager()
        ws = _FakeWS()
        await mgr.connect(ws)  # type: ignore[arg-type]
        engine = SimEngine(mgr)
        sent = await engine.apply_combat_feed(
            ScriptedCombatEventFeedProvider(), prev_s=300.0, now_s=305.0
        )
        assert sent == 0
        assert ws.messages == []
