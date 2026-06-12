"""Domain model for a move order (Wave 3)."""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from app.domain.route import RouteMetric


class MoveOrderStatus(StrEnum):
    PENDING = "pending"  # created, awaiting confirmation
    ACTIVE = "active"  # confirmed; the sim is advancing it
    COMPLETE = "complete"  # unit has arrived
    CANCELLED = "cancelled"
    HALTED = "halted"  # stopped at an obstruction (block, or threat-L5 in Safe); awaiting operator
    CROSSING = "crossing"  # operator chose "proceed slowly": crawling across the obstruction
    CONTINUING = "continuing"  # "Continue": cross the threat at normal speed (v2 W13 F5)


class MoveOrder(BaseModel):
    """A unit's committed route and its progress."""

    model_config = ConfigDict(frozen=True)

    id: str
    instance_id: str
    status: MoveOrderStatus
    metric: RouteMetric
    distance_m: float = Field(ge=0)
    duration_s: float = Field(ge=0)
    fuel_consumed_l: float = Field(ge=0)
    progress_m: float = Field(ge=0)
    geometry: list[list[float]]
