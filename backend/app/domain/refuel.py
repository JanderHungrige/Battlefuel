"""Domain models for refuel orders and the recommender seam (Wave 5 Feature 3).

A refuel order moves fuel from a mobile truck into a thirsty unit, but only once the two are
co-located. ``RefuelRecommendation`` is the **stable** return type of the pluggable
``RefuelRecommender`` (see ``services/refuel_recommender.py``): the Wave-6 optimizer fills
``score``/``rationale``; the nearest placeholder leaves them ``None``.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from app.domain.unit import FuelType


class RefuelOrderStatus(StrEnum):
    PENDING = "pending"  # created, recommendation made, awaiting confirmation
    ACTIVE = "active"  # confirmed; the sim watches for co-location
    COMPLETE = "complete"  # fuel transferred
    CANCELLED = "cancelled"


class RefuelOrder(BaseModel):
    """An order to refuel ``unit_id`` from ``truck_id`` when they meet."""

    model_config = ConfigDict(frozen=True)

    id: str
    unit_id: str
    # Source is EITHER a mobile truck OR a fixed depot (v2 Wave 12 F2): exactly one is set.
    truck_id: str | None = None
    depot_id: str | None = None
    fuel_type: FuelType
    status: RefuelOrderStatus
    rendezvous_lat: float
    rendezvous_lon: float
    rendezvous_h3: str
    # None = fill to capacity.
    requested_liters: float | None = Field(default=None, ge=0)
    transferred_liters: float = Field(default=0.0, ge=0)


class Rendezvous(BaseModel):
    """Where the truck and unit should meet (transfer requires identical position)."""

    model_config = ConfigDict(frozen=True)

    lat: float
    lon: float
    h3_index: str


class RefuelRecommendation(BaseModel):
    """A recommender's choice of fuel truck + rendezvous. Stable shape across implementations."""

    model_config = ConfigDict(frozen=True)

    truck_id: str
    rendezvous: Rendezvous
    # Filled by an optimizing recommender (Wave 6); left None by the nearest placeholder.
    score: float | None = None
    rationale: str | None = None
