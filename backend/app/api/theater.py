"""Theater endpoint (Feature 5 support). Mounted under /api/v1.

Single source of truth for the frontend's initial map view and extent.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.domain.theater import HOHENFELS, Theater

router = APIRouter(tags=["theater"])


@router.get("/theater")
def get_theater() -> Theater:
    """Return the active seed theater (bbox, center, default zoom)."""
    return HOHENFELS
