"""Domain model for a map tile (Wave 2 Feature 3: hex-tile-model-api).

Tiles are H3 hexagons covering the theater. H3 is the spatial index: a lat/lng maps to
exactly one cell, and a cell's boundary is derivable on demand — so tiles need no stored
geometry. Each tile carries game attributes that later waves use to modify movement,
fuel burn, and combat likelihood.
"""

from __future__ import annotations

from enum import StrEnum

import h3
from pydantic import BaseModel, ConfigDict, Field


class TerrainType(StrEnum):
    OPEN = "open"
    FOREST = "forest"
    URBAN = "urban"
    WATER = "water"
    FARMLAND = "farmland"
    WETLAND = "wetland"
    MILITARY = "military"
    UNKNOWN = "unknown"


class IntelLevel(StrEnum):
    """How well the sector is reconnoitred / understood."""

    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Weather(StrEnum):
    CLEAR = "clear"
    RAIN = "rain"
    FOG = "fog"
    SNOW = "snow"
    STORM = "storm"


class RoadCondition(StrEnum):
    CLEAR = "clear"
    DAMAGED = "damaged"
    BLOCKED = "blocked"


class Cover(StrEnum):
    NONE = "none"
    LIGHT = "light"
    HEAVY = "heavy"


class Tile(BaseModel):
    """A single hex tile with its game attributes (API representation)."""

    model_config = ConfigDict(frozen=True)

    h3_index: str
    resolution: int = Field(ge=0, le=15)
    center_lat: float
    center_lon: float
    terrain: TerrainType
    threat_level: int = Field(ge=0, le=5, description="0 = benign … 5 = extreme")
    intel_level: IntelLevel
    weather: Weather
    road_condition: RoadCondition
    cover: Cover
    # Hex boundary as a closed ring of [lon, lat] pairs (GeoJSON order), derived from H3.
    boundary: list[list[float]]

    @staticmethod
    def boundary_for(h3_index: str) -> list[list[float]]:
        """Return the cell boundary as [lon, lat] pairs (H3 yields lat, lng)."""
        return [[lng, lat] for lat, lng in h3.cell_to_boundary(h3_index)]
