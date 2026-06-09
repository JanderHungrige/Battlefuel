"""Domain model for scheduled rendezvous fuel runs (v2 Wave 13 F2).

A *scheduled* rendezvous is a fuel run planned for a future sim-clock time rather than dispatched
now. Like a buy order (``domain/buy_order.py``), the schedule is tracked as a **countdown**
(``remaining_game_s``) decremented each sim tick so it survives sim/process restarts — the sim
clock itself is not persisted. When the countdown reaches zero a reminder fires and the order
flips ``planned → due``; the operator then confirms-to-launch (no silent auto-dispatch).
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from app.domain.route import RouteMetric, RouteMode


class RendezvousOrderStatus(StrEnum):
    PLANNED = "planned"  # scheduled; the sim counts it down
    DUE = "due"  # countdown elapsed; reminder fired, awaiting confirm-launch
    LAUNCHED = "launched"  # operator confirmed; both movers + refuel dispatched
    CANCELLED = "cancelled"


class RendezvousOrder(BaseModel):
    """A rendezvous fuel run planned against the sim clock, filed in the order archive."""

    model_config = ConfigDict(frozen=True)

    id: str
    truck_id: str
    unit_id: str
    sector_lat: float
    sector_lon: float
    sector_h3: str
    metric: RouteMetric
    mode: RouteMode
    # Full countdown set at schedule time (for display) and the live remaining countdown.
    scheduled_game_s: float = Field(ge=0)
    remaining_game_s: float = Field(ge=0)
    # Planned-route snapshots from schedule time (display/preview only; re-planned on launch).
    truck_geometry: list[list[float]]
    unit_geometry: list[list[float]]
    truck_fuel_to_meet: float = Field(default=0.0, ge=0)
    unit_fuel_to_meet: float = Field(default=0.0, ge=0)
    status: RendezvousOrderStatus
