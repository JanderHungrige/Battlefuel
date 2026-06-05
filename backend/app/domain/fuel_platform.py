"""Domain model for fuel-management platforms (v2 Wave 11 Feature 2: fuel-platform-selector).

A fuel platform is the procurement system an OF-8 order is placed through (e.g. World Fuel
DFMS, Shell FM). It carries display branding only — placing an order through a platform is
faked in the UI (the order mask, F3); the platform does not change the buy-order mechanics.
"""

from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict, Field

_SLUG_RE = re.compile(r"[^a-z0-9]+")


class FuelPlatform(BaseModel):
    """A selectable fuel-management / procurement platform."""

    model_config = ConfigDict(frozen=True)

    id: str
    name: str = Field(min_length=1, max_length=80)
    logo_key: str | None = None
    is_default: bool = False


def platform_id_from_name(name: str) -> str:
    """Derive a stable ``platform-<slug>`` id from a display name."""
    slug = _SLUG_RE.sub("-", name.strip().lower()).strip("-")
    return f"platform-{slug}" if slug else "platform-unnamed"
