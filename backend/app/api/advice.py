"""Advice endpoints namespace (Wave 6 Feature 1: optimizer-foundation). Mounted under /api/v1.

This module owns the shared ``/advice`` router and a capabilities endpoint. Each advisor feature
(33 refuel, 34 redistribution, 35 movement) adds its routes to this router, so all advice lives
under ``/api/v1/advice/*``.
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/advice", tags=["advice"])

# Advice kinds the engine currently offers. Advisor features append their kind here as they land.
CAPABILITIES: list[str] = []


@router.get("/capabilities")
def capabilities() -> dict[str, list[str]]:
    """List the advice kinds the engine can currently produce."""
    return {"kinds": sorted(set(CAPABILITIES))}
