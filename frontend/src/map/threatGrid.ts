// Multi-resolution threat model (v2 Wave 21, threat-grid-code-model) — frontend mirror of the
// backend app/services/threat_grid.py. A tile threat occupies an MGRS-aligned square of side = its
// grid code (precision_m), independent of whatever grid the operator is viewing. Threats nest
// highest-wins: a smaller high-threat patch shows through a larger low-threat area. Pure (no
// MapLibre/canvas), so it is unit-testable.

import type { Tile } from '../api/types'
import { cellIdFor } from './mgrsGrid'

/** Footprint side (m) for a tile threat with no located-event precision — the ambient/seeded
 *  threat's native size (~the H3 res-8 hex ≈ the 1 km MGRS cell). Mirrors the backend constant. */
export const DEFAULT_THREAT_PRECISION_M = 1000

/** A threat footprint square: a representative point in the cell, its grid-code side, and level. */
export interface ThreatSquare {
  lat: number
  lon: number
  precisionM: number
  threat: number
}

/**
 * A tile's threat grid code: the located-event location detail if it carries one (a 500 m mine
 * stays 500 m regardless of the displayed grid — the Wave 21 headline), else the ambient default =
 * the **displayed** grid precision, so operator-set/seeded threat is WYSIWYG at the grid the
 * operator is editing/viewing (v2 Wave 22 fix).
 */
export function tilePrecisionM(tile: Tile, displayPrecisionM: number): number {
  return tile.last_event?.precision_m ?? displayPrecisionM
}

/**
 * The distinct threat footprint squares for a set of tiles: **located-event** threats at their own
 * grid-code size (independent of the displayed grid), **ambient** threats at `displayPrecisionM`.
 * Tiles sharing a (precision, cell) footprint collapse to the max level. Sorted ASCENDING by level
 * so a higher-threat square paints OVER a lower one (highest-wins nesting). Zero-threat tiles drop.
 */
export function threatSquares(tiles: Tile[], displayPrecisionM: number): ThreatSquare[] {
  const cells = new Map<string, ThreatSquare>()
  for (const t of tiles) {
    if (t.threat_level <= 0) continue
    const p = tilePrecisionM(t, displayPrecisionM)
    const key = `${p}:${cellIdFor(t.center_lat, t.center_lon, p)}`
    const prev = cells.get(key)
    if (prev === undefined) {
      cells.set(key, {
        lat: t.center_lat,
        lon: t.center_lon,
        precisionM: p,
        threat: t.threat_level,
      })
    } else if (t.threat_level > prev.threat) {
      prev.threat = t.threat_level
    }
  }
  return [...cells.values()].sort((a, b) => a.threat - b.threat)
}
