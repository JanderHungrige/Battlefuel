// Multi-tile selection for batch threat-setting (v2 Wave 22 F4, multi-tile-threat-select). Holding
// Shift/Ctrl while clicking accumulates MGRS cells; the threat set then applies to every H3 tile in
// the selected cells at once. Pure (MGRS-cell math only), so it is unit-testable. Uses the Wave 21
// MGRS-cell index so the selection respects the displayed grid resolution.

import type { Tile } from '../api/types'
import { cellIdFor } from '../map/mgrsGrid'

export interface CellPoint {
  lat: number
  lon: number
}

/** Toggle a cell's membership in the multi-selection, keyed by its MGRS cell id at `precisionM`. */
export function toggleCell(cells: CellPoint[], cell: CellPoint, precisionM: number): CellPoint[] {
  const id = cellIdFor(cell.lat, cell.lon, precisionM)
  const exists = cells.some((c) => cellIdFor(c.lat, c.lon, precisionM) === id)
  return exists
    ? cells.filter((c) => cellIdFor(c.lat, c.lon, precisionM) !== id)
    : [...cells, cell]
}

/** All distinct H3 tile indexes whose tiles fall in any of the selected MGRS cells. */
export function cellsToH3Indexes(cells: CellPoint[], tiles: Tile[], precisionM: number): string[] {
  if (cells.length === 0) return []
  const ids = new Set(cells.map((c) => cellIdFor(c.lat, c.lon, precisionM)))
  const out = new Set<string>()
  for (const t of tiles) {
    if (ids.has(cellIdFor(t.center_lat, t.center_lon, precisionM))) out.add(t.h3_index)
  }
  return [...out]
}
