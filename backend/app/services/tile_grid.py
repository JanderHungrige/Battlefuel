"""H3 hex-grid generation for a theater (Feature 3).

Pure functions over H3 — no database. ``generate_cells`` returns the set of H3 cells
covering a theater's bbox at a given resolution; resolution 8 (~0.7 km² hexes) gives a
few hundred tiles over Hohenfels, a good balance of granularity and count.
"""

from __future__ import annotations

import h3

from app.domain.theater import Theater

DEFAULT_RESOLUTION = 8


def generate_cells(theater: Theater, resolution: int = DEFAULT_RESOLUTION) -> list[str]:
    """Return the sorted H3 cells whose centers fall within the theater bbox."""
    b = theater.bbox
    outer = [
        (b.south, b.west),
        (b.south, b.east),
        (b.north, b.east),
        (b.north, b.west),
    ]
    poly = h3.LatLngPoly(outer)
    return sorted(h3.h3shape_to_cells(poly, resolution))


def cell_center(h3_index: str) -> tuple[float, float]:
    """Return ``(lat, lon)`` of a cell's center."""
    lat, lng = h3.cell_to_latlng(h3_index)
    return lat, lng
