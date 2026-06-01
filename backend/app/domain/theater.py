"""The theater of operations — the geographic area the game is played on.

Wave 2 ships a single fixed seed theater (Hohenfels training area, Germany). The bbox
drives the hex-grid extent (Feature 07) and the frontend's initial map view (Feature 05);
an arbitrary-region importer comes in a later milestone.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, model_validator


class BBox(BaseModel):
    """A geographic bounding box in WGS84 (EPSG:4326) degrees."""

    model_config = ConfigDict(frozen=True)

    west: float
    south: float
    east: float
    north: float

    @model_validator(mode="after")
    def _check_order(self) -> BBox:
        if self.west >= self.east:
            raise ValueError("bbox west must be < east")
        if self.south >= self.north:
            raise ValueError("bbox south must be < north")
        return self


class Theater(BaseModel):
    """A named area of operations with its map extent and default view."""

    model_config = ConfigDict(frozen=True)

    id: str
    name: str
    bbox: BBox
    center_lon: float
    center_lat: float
    default_zoom: float


HOHENFELS = Theater(
    id="hohenfels",
    name="Hohenfels Training Area",
    bbox=BBox(west=11.78, south=49.18, east=11.92, north=49.27),
    center_lon=11.85,
    center_lat=49.225,
    default_zoom=12.0,
)
