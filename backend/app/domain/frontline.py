"""The notional East/West frontline for the seeded Hohenfels scenario (v2 Wave 14).

NATO holds the **WEST**, OPFOR the **EAST**, separated by an irregular north-south frontline -
deliberately not a straight meridian: it weaves around the theater centre (lon 11.85) so the
front has **bulges** (salients reaching east) and **gaps** (dents pulled west). This is the single
shared definition of the front: the unit/depot seeds place forces relative to it
(``instance_seed``, ``enemy_units``, ``supply_seed``) and the event engine concentrates threats
around it (``event_engine``). Pure and deterministic so seeds, the emitter, and tests all agree.
"""

from __future__ import annotations

import math
from itertools import pairwise
from random import Random

# (lat, lon) control points, latitude ASCENDING. The longitudes weave east/west of the theater
# centre (11.85) to give the front its bulges and gaps across the ~10 km north-south span.
FRONTLINE_CONTROL: tuple[tuple[float, float], ...] = (
    (49.180, 11.860),  # south - bulge east
    (49.205, 11.842),  # gap - pulled west
    (49.225, 11.858),  # centre - bulge east
    (49.245, 11.838),  # gap - pulled west
    (49.270, 11.852),  # north
)

# Depots and HQ sit in the deep rear: at or west of this longitude.
REAR_LON_MAX: float = 11.815


def frontline_lon(lat: float) -> float:
    """Longitude of the frontline at ``lat`` (piecewise-linear between control points, clamped)."""
    pts = FRONTLINE_CONTROL
    if lat <= pts[0][0]:
        return pts[0][1]
    if lat >= pts[-1][0]:
        return pts[-1][1]
    for (lat0, lon0), (lat1, lon1) in pairwise(pts):
        if lat0 <= lat <= lat1:
            t = (lat - lat0) / (lat1 - lat0)
            return lon0 + t * (lon1 - lon0)
    return pts[-1][1]  # unreachable: lat is within [first, last] by the guards above


def is_west(lat: float, lon: float) -> bool:
    """True if (lat, lon) lies on the NATO (west) side of the frontline."""
    return lon < frontline_lon(lat)


def is_east(lat: float, lon: float) -> bool:
    """True if (lat, lon) lies on the OPFOR (east) side of the frontline."""
    return lon > frontline_lon(lat)


# Threat-density model (event-spawn weighting, v2 Wave 14): most activity hugs the front, the
# OPFOR east stays broadly threatened, and the NATO west sees only occasional deep-in sightings.
_FRONT_SIGMA_DEG = 0.012  # ~1 km: half-width of the hot band straddling the front
_EAST_BASE = 0.6  # the east is mostly threat-filled even away from the front
_WEST_BASE = 0.10  # sparse baseline for deep-in western sightings
_WEST_DECAY_DEG = 0.02  # how fast western activity falls off behind the line


def threat_weight(lat: float, lon: float) -> float:
    """Relative likelihood a threat event spawns at (lat, lon). Always > 0.

    A Gaussian hot band straddles the front; the east carries a broad base on top of it, while the
    west only gets a small near-front spill plus a baseline that decays with depth behind the line.
    """
    d = lon - frontline_lon(lat)  # > 0 east (OPFOR), < 0 west (NATO rear)
    front = math.exp(-((d / _FRONT_SIGMA_DEG) ** 2))
    if d >= 0:
        return _EAST_BASE + front
    return front * 0.5 + _WEST_BASE * math.exp(d / _WEST_DECAY_DEG)


# Initial-threat seed bands (longitude degrees relative to the front).
_FRONT_BAND_DEG = 0.012  # width of the hot combat band on the east shoulder of the front
_REAR_DEPTH_DEG = 0.015  # west of this (behind the line) the rear is benign


def initial_threat_level(lat: float, lon: float, rng: Random) -> int:
    """A plausible STARTING threat level (0-5) for a tile, concentrated on the front + east.

    Deep NATO rear is benign (rare sighting); the front's west shoulder skirmishes; the front's
    east shoulder is the hottest (combat); the OPFOR-held deep east is broadly threatened. Driven
    by an injected RNG so the seeded map is deterministic (v2 Wave 14).
    """
    d = lon - frontline_lon(lat)
    if d < -_REAR_DEPTH_DEG:  # deep NATO rear
        return 1 if rng.random() < 0.05 else 0
    if d < 0.0:  # west shoulder of the front
        return rng.choice((1, 2, 2, 3))
    if d < _FRONT_BAND_DEG:  # east shoulder of the front — hottest
        return rng.choice((3, 4, 4, 5))
    # Deep east (OPFOR-held): a durable ~50% floor at 3+ (never decays) keeps the east visibly
    # threatened, with the rest light sightings that fade and are replenished.
    return rng.choice((1, 2, 3, 3))
