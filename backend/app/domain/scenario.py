"""Scenario snapshot domain models (v2 Wave 22 F5, scenario-save-load).

A ``ScenarioSnapshot`` is the serialisable, source-agnostic picture of the hand-built state the
operator can save and reload: blue forces, red forces, depots (with per-fuel stock), tile threats,
and obstacles. Stored as JSONB on the ``scenarios`` row.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UnitSnap(BaseModel):
    """A placed friendly unit (references a catalog ``UnitType`` by id)."""

    model_config = ConfigDict(frozen=True)

    unit_type_id: str
    name: str
    lat: float
    lon: float
    status: str = "operational"
    current_fuel_liters: float | None = None


class EnemySnap(BaseModel):
    """A placed hostile unit."""

    model_config = ConfigDict(frozen=True)

    name: str
    sidc: str
    lat: float
    lon: float
    echelon: str | None = None


class StockSnap(BaseModel):
    """One fuel type's stock at a depot."""

    model_config = ConfigDict(frozen=True)

    fuel_type: str
    quantity_liters: float
    capacity_liters: float


class DepotSnap(BaseModel):
    """A fuel depot with its per-fuel stock."""

    model_config = ConfigDict(frozen=True)

    name: str
    lat: float
    lon: float
    site_type: str | None = None
    stocks: list[StockSnap] = Field(default_factory=list)


class ThreatSnap(BaseModel):
    """A tile's operator/ambient threat level (only threatened tiles are stored)."""

    model_config = ConfigDict(frozen=True)

    h3_index: str
    threat_level: int


class ObstacleSnap(BaseModel):
    """An operator-placed obstacle blocking an H3 cell."""

    model_config = ConfigDict(frozen=True)

    h3_index: str
    kind: str = "manual"


class ScenarioSnapshot(BaseModel):
    """The full hand-built state a scenario captures."""

    model_config = ConfigDict(frozen=True)

    units: list[UnitSnap] = Field(default_factory=list)
    enemies: list[EnemySnap] = Field(default_factory=list)
    depots: list[DepotSnap] = Field(default_factory=list)
    threats: list[ThreatSnap] = Field(default_factory=list)
    obstacles: list[ObstacleSnap] = Field(default_factory=list)


class ScenarioSummary(BaseModel):
    """A saved scenario's identity (list view — no snapshot payload)."""

    model_config = ConfigDict(frozen=True)

    id: str
    name: str
    created_at: datetime
