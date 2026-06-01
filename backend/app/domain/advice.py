"""Shared advice domain for the Wave 6 optimization engine (Feature 1: optimizer-foundation).

Every advisor (refuel-assignment, redistribution, movement/route) returns an ``AdviceResult`` of
``Recommendation``s. A recommendation always carries a human ``rationale`` (the demo-state's "with
rationale" guarantee) and a structured ``action`` shaped like an existing order request, so the
frontend can "apply" it without per-kind glue.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class RecommendationKind(StrEnum):
    ROUTE = "route"
    REPOSITION = "reposition"
    REFUEL = "refuel"
    REDISTRIBUTION = "redistribution"


class Recommendation(BaseModel):
    """A single piece of advice: a scored, explained, applyable suggestion."""

    model_config = ConfigDict(frozen=True)

    kind: RecommendationKind
    target: str = Field(description="What this is about, e.g. a unit or depot id")
    # A payload shaped like the target order's request body, e.g.
    # {"endpoint": "move-orders", "instance_id": ..., "dest_lat": ..., "dest_lon": ...}.
    action: dict[str, object]
    score: float = Field(description="Comparable within one AdviceResult (per-advisor convention)")
    rationale: str = Field(min_length=1, description="Terse human explanation")


class AdviceResult(BaseModel):
    """A set of recommendations of one kind, with an optional summary."""

    model_config = ConfigDict(frozen=True)

    kind: RecommendationKind
    recommendations: list[Recommendation]
    summary: str | None = None
