"""Tile-cost model (Wave 4, tile-cost-model).

Single source of truth for how tile attributes affect movement: a per-tile ``speed_factor``
and ``fuel_factor`` (terrain x road_condition) plus the threat weighting of the "safe"
routing cost. Consumed by routing-graph annotation, the route planner, and the sim, so plan
estimates and live burn agree. Pure — no I/O. Factor tables are tunable here.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from app.domain.tile import RoadCondition, TerrainType

# speed_factor multiplies road speed; fuel_factor multiplies consumption. ``open`` = baseline.
TERRAIN_SPEED: Final[dict[TerrainType, float]] = {
    TerrainType.OPEN: 1.0,
    TerrainType.FARMLAND: 0.95,
    TerrainType.MILITARY: 0.90,
    TerrainType.FOREST: 0.80,
    TerrainType.URBAN: 0.70,
    TerrainType.WETLAND: 0.60,
    TerrainType.WATER: 0.50,
    TerrainType.UNKNOWN: 1.0,
}
TERRAIN_FUEL: Final[dict[TerrainType, float]] = {
    TerrainType.OPEN: 1.0,
    TerrainType.FARMLAND: 1.05,
    TerrainType.MILITARY: 1.05,
    TerrainType.FOREST: 1.15,
    TerrainType.URBAN: 1.20,
    TerrainType.WETLAND: 1.30,
    TerrainType.WATER: 1.40,
    TerrainType.UNKNOWN: 1.0,
}
ROAD_SPEED: Final[dict[RoadCondition, float]] = {
    RoadCondition.CLEAR: 1.0,
    RoadCondition.DAMAGED: 0.5,
    # Obstructed (ex-"blocked"): a heavy crawl, NOT impassable — routing uses it as a costly last
    # resort (no hard-avoid) and units crawl through instead of halting (doc 101).
    RoadCondition.OBSTRUCTED: 0.15,
}
ROAD_FUEL: Final[dict[RoadCondition, float]] = {
    RoadCondition.CLEAR: 1.0,
    RoadCondition.DAMAGED: 1.3,
    RoadCondition.OBSTRUCTED: 1.6,
}

# Explicit "left the road" fuel penalty for off-road (terrain) movement (v2 Wave 18 F5). Driving
# cross-country burns more than the bare terrain factor implies. The off-road SPEED penalty is
# already carried by each unit's ``speed_offroad_kph`` (≈half road speed), so this is fuel-only to
# avoid double-counting speed. Applied to the off-road fuel factor in the terrain router; this is
# the single tunable source. (Live-sim off-road traversal is governed separately by the
# mode-not-persisted known issue in TODO.md.)
OFFROAD_FUEL_PENALTY: Final[float] = 1.25

# Representative off-road speed factor for the short straight STUBS that join a unit to the nearest
# road and the road to the destination (v2 Wave 18 Option 3). Off-road movement is ≈ half road
# speed, so a stub's time-cost is its length / this factor (~2x a road metre). Used both to weight
# the stub when CHOOSING the cheapest entry/exit edge (so a long stub to a far road loses to a
# nearer road) and in the route's effective-distance (so the stub's slowness shows in the ETA).
OFFROAD_STUB_SPEED_FACTOR: Final[float] = 0.5

# How strongly threat inflates the "safe" cost: safe = time_cost * (1 + W * threat_level).
THREAT_WEIGHT: Final[float] = 5.0
# Sentinel cost for impassable edges (e.g. obstacle-filtered) — large but finite.
BLOCKED_COST: Final[float] = 1.0e12


@dataclass(frozen=True)
class TileFactors:
    """Multipliers a tile applies to a unit's road speed and fuel consumption."""

    speed_factor: float
    fuel_factor: float

    @property
    def passable(self) -> bool:
        return self.speed_factor > 0.0


def tile_factors(terrain: TerrainType, road_condition: RoadCondition) -> TileFactors:
    """Combined (multiplicative) speed/fuel factors for a tile. Unknown values stay neutral."""
    speed = TERRAIN_SPEED.get(terrain, 1.0) * ROAD_SPEED.get(road_condition, 1.0)
    fuel = TERRAIN_FUEL.get(terrain, 1.0) * ROAD_FUEL.get(road_condition, 1.0)
    return TileFactors(speed_factor=speed, fuel_factor=fuel)


def edge_time_cost(length_m: float, factors: TileFactors) -> float:
    """Time-proxy edge cost: real metres / speed_factor. Impassable edges return BLOCKED_COST."""
    if not factors.passable:
        return BLOCKED_COST
    return length_m / factors.speed_factor


def safe_edge_cost(time_cost: float, threat_level: int) -> float:
    """Threat-weighted time cost for the SAFE metric. Impassable stays impassable."""
    if time_cost >= BLOCKED_COST:
        return time_cost
    return time_cost * (1.0 + THREAT_WEIGHT * threat_level)
