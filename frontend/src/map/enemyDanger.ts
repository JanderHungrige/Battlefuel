// Enemy danger-zone display geometry (v2 Wave 21, enemy-danger-circle-render). When a hostile unit
// is on the map, draw a 500 m-radius danger circle around it and colour the 500 m MGRS cells it
// covers. This is a DISPLAY complement to the routing-side enemy danger (Wave 16, enemy_danger.py),
// which scales by echelon and feeds the SAFE cost — here the indicator is a fixed 500 m ring so the
// operator sees a consistent "keep clear" radius. Pure (no MapLibre), so it is unit-testable.

import { cellIdFor } from './mgrsGrid'

/** Fixed display radius (m) of the enemy danger circle. Routing danger (W16) stays echelon-scaled. */
export const ENEMY_DANGER_RADIUS_M = 500
/** Size (m) of the MGRS cells washed red inside the danger radius. */
export const DANGER_CELL_M = 500

const M_PER_DEG_LAT = 111_320 // metres per degree latitude (good enough at theater scale)

function metresPerDegLon(lat: number): number {
  return M_PER_DEG_LAT * (Math.cos((lat * Math.PI) / 180) || 1)
}

/** Equirectangular distance in metres between two lon/lat points — fine across a ~10 km theater. */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const meanLat = ((lat1 + lat2) / 2) * (Math.PI / 180)
  const dx = (lon2 - lon1) * M_PER_DEG_LAT * Math.cos(meanLat)
  const dy = (lat2 - lat1) * M_PER_DEG_LAT
  return Math.hypot(dx, dy)
}

/** A closed ring of `[lon, lat]` points approximating a circle of `radiusM` around `(lat, lon)`. */
export function dangerCircle(
  lat: number,
  lon: number,
  radiusM: number,
  segments = 48,
): number[][] {
  const dLat = radiusM / M_PER_DEG_LAT
  const dLon = radiusM / metresPerDegLon(lat)
  const ring: number[][] = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * 2 * Math.PI
    ring.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)])
  }
  return ring
}

/**
 * Representative points of the distinct `cellM` MGRS cells that any enemy's `radiusM` danger circle
 * covers — deduped by cell id across all enemies. Each point sits in its cell, so
 * `squareCornersFromCenter` snaps it to the correct lattice square. Samples the circle's bbox at
 * half-cell steps so every overlapping cell is caught.
 */
export function dangerCells(
  enemies: { lat: number; lon: number }[],
  radiusM: number,
  cellM: number,
): { lat: number; lon: number }[] {
  const seen = new Map<string, { lat: number; lon: number }>()
  const step = cellM / 2
  for (const e of enemies) {
    const dLat = radiusM / M_PER_DEG_LAT
    const dLon = radiusM / metresPerDegLon(e.lat)
    const latStep = step / M_PER_DEG_LAT
    const lonStep = step / metresPerDegLon(e.lat)
    for (let la = e.lat - dLat; la <= e.lat + dLat + 1e-9; la += latStep) {
      for (let lo = e.lon - dLon; lo <= e.lon + dLon + 1e-9; lo += lonStep) {
        if (distanceM(e.lat, e.lon, la, lo) > radiusM) continue
        const id = cellIdFor(la, lo, cellM)
        if (!seen.has(id)) seen.set(id, { lat: la, lon: lo })
      }
    }
  }
  return [...seen.values()]
}
