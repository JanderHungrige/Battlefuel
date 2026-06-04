"""Routing domain models (Wave 3).

``RoutePath`` is the raw output of the routing graph (Feature routing-graph): the path
geometry plus distance and threat aggregates. ``RouteOption`` (Feature route-planning-api)
layers unit-specific duration and fuel on top.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class RouteMetric(StrEnum):
    """Which cost the router minimizes."""

    FAST = "fast"  # minimize distance (≈ time at constant unit speed)
    SAFE = "safe"  # minimize threat-weighted distance


class RouteMode(StrEnum):
    """How the unit travels — selects the router and the speed (v2 Wave 1, terrain-router)."""

    ROAD = "road"  # pgRouting over the road graph at the unit's road speed (default)
    OFFROAD = "offroad"  # A* over the H3 terrain grid at the unit's off-road / by-foot speed
    HYBRID = "hybrid"  # per metric, the better of the road vs off-road route (v2 Wave 10)
    DIRECT = "direct"  # near-straight cross-country line over the terrain grid (v2 Wave 10)


class RoutePath(BaseModel):
    """A computed path through the road graph."""

    model_config = ConfigDict(frozen=True)

    metric: RouteMetric
    geometry: list[list[float]] = Field(description="Ordered [lon, lat] points along the path")
    distance_m: float = Field(ge=0)
    # Terrain-aware sums over the path's edges (Wave 4 tile-cost-model). Default 0 ⇒ the planner
    # falls back to distance_m for paths computed before annotation.
    effective_distance_m: float = Field(default=0.0, ge=0, description="Σ time_cost (time-proxy)")
    fuel_distance_m: float = Field(default=0.0, ge=0, description="Σ fuel_factor·time_cost")
    threat_max: int = Field(ge=0)
    threat_avg: float = Field(ge=0)
    # True when the threat/blocked-aware primary graph had no path and the router fell back to a
    # real-distance route over the full graph (manual obstacles still excluded). Lets callers
    # surface a "degraded route" hint; the route is still valid and traversable.
    degraded: bool = Field(default=False, description="route used the full-graph distance fallback")


class RouteOption(BaseModel):
    """A route presented to the commander: a path plus unit-specific time & fuel estimates."""

    model_config = ConfigDict(frozen=True)

    label: str  # "fastest" | "safest"
    metric: RouteMetric
    geometry: list[list[float]]
    distance_m: float = Field(ge=0)
    duration_s: float = Field(ge=0)
    threat_max: int = Field(ge=0)
    threat_avg: float = Field(ge=0)
    fuel_consumed_l: float = Field(ge=0)
    fuel_remaining_l: float = Field(ge=0)
    sufficient_fuel: bool
