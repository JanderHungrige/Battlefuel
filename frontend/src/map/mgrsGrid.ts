// Pure MGRS grid math (v2 Wave 2) — no canvas/MapLibre, so it is unit-testable.
//
// proj4 does lat/lon ↔ UTM (zone 32N, the Hohenfels theater) for grid-line stepping; the `mgrs`
// package produces the MGRS coordinate strings (labels + the 1 m readout). The H3 hexes remain the
// authoritative data layer — this module only draws a coordinate reference grid.

import { forward as mgrsForward } from 'mgrs'
import proj4 from 'proj4'
import type { BBox } from '../api/types'

const UTM_32N = '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs'

export interface GridPrecision {
  m: number
  label: string
}

/** Drawn grid square sizes. Standard MGRS decades plus operator-friendly 5/2 km and 500 m steps
 * (finer levels would be solid ink at theater scale — the readout always covers 1 m). */
export const GRID_PRECISIONS: GridPrecision[] = [
  { m: 100000, label: '100 km' },
  { m: 10000, label: '10 km' },
  { m: 5000, label: '5 km' },
  { m: 2000, label: '2 km' },
  { m: 1000, label: '1 km' },
  { m: 500, label: '500 m' },
  { m: 100, label: '100 m' },
]

export const DEFAULT_PRECISION_M = 1000

/** MGRS label digit-accuracy fine enough to distinguish adjacent squares at a drawn precision:
 * the smallest accuracy whose resolution (10^(5-acc) m) is ≤ the spacing. 100km→0 … 500m/100m→3. */
export function precisionToAccuracy(precisionM: number): number {
  const acc = 5 - Math.floor(Math.log10(precisionM))
  return Math.max(0, Math.min(5, acc))
}

/** Full MGRS string for a point, to `accuracy` digits (default 5 = 1 m). */
export function toMgrs(lat: number, lon: number, accuracy = 5): string {
  return mgrsForward([lon, lat], accuracy)
}

/** Pretty-print an MGRS string: `32UQV0752455822` → `32U QV 07524 55822`. */
export function formatMgrs(mgrs: string): string {
  const m = /^(\d{1,2}[C-X])([A-Z]{2})(\d*)$/.exec(mgrs)
  if (!m) return mgrs
  const [, gzd, square, digits] = m
  if (digits.length === 0) return `${gzd} ${square}`
  const half = digits.length / 2
  return `${gzd} ${square} ${digits.slice(0, half)} ${digits.slice(half)}`
}

/** Compact per-square label, e.g. acc 2 (1 km) `32UQV0755` → `07 55`; acc 0 (100 km) → `QV`. */
export function squareLabel(mgrs: string, accuracy: number): string {
  const m = /^(\d{1,2}[C-X])([A-Z]{2})(\d*)$/.exec(mgrs)
  if (!m) return mgrs
  const [, , square, digits] = m
  if (accuracy === 0 || digits.length === 0) return square
  const half = digits.length / 2
  return `${digits.slice(0, half)} ${digits.slice(half)}`
}

function toLonLat(easting: number, northing: number): [number, number] {
  const [lon, lat] = proj4(UTM_32N, 'EPSG:4326', [easting, northing])
  return [lon, lat]
}

function toUtm(lon: number, lat: number): [number, number] {
  const [e, n] = proj4('EPSG:4326', UTM_32N, [lon, lat])
  return [e, n]
}

interface Extent {
  minE: number
  minN: number
  maxE: number
  maxN: number
}

function bboxExtent(bbox: BBox): Extent {
  const corners = [
    toUtm(bbox.west, bbox.south),
    toUtm(bbox.east, bbox.south),
    toUtm(bbox.east, bbox.north),
    toUtm(bbox.west, bbox.north),
  ]
  const es = corners.map((c) => c[0])
  const ns = corners.map((c) => c[1])
  return { minE: Math.min(...es), maxE: Math.max(...es), minN: Math.min(...ns), maxN: Math.max(...ns) }
}

const SAMPLES = 8 // points per grid line (UTM lines curve slightly in lon/lat)

/** Grid lines for `precisionM` across the theater, as `[lon,lat]` polylines. */
export function gridLines(bbox: BBox, precisionM: number): number[][][] {
  const { minE, minN, maxE, maxN } = bboxExtent(bbox)
  const lines: number[][][] = []
  const firstE = Math.ceil(minE / precisionM) * precisionM
  const firstN = Math.ceil(minN / precisionM) * precisionM
  for (let e = firstE; e <= maxE; e += precisionM) {
    const line: number[][] = []
    for (let i = 0; i <= SAMPLES; i++) line.push(toLonLat(e, minN + ((maxN - minN) * i) / SAMPLES))
    lines.push(line)
  }
  for (let n = firstN; n <= maxN; n += precisionM) {
    const line: number[][] = []
    for (let i = 0; i <= SAMPLES; i++) line.push(toLonLat(minE + ((maxE - minE) * i) / SAMPLES, n))
    lines.push(line)
  }
  return lines
}

/**
 * The MGRS-grid-aligned square of side `precisionM` (metres, zone 32U) that contains `(lat, lon)`,
 * as a closed ring of 5 `[lon, lat]` points. Snaps the point's UTM easting/northing down to the
 * `precisionM` lattice — the same lattice `gridLines` draws — so an event renders in its containing
 * MGRS cell, not an arbitrary centred box. (v2 Wave 3, threat-mgrs-squares.)
 */
export function squareCornersFromCenter(lat: number, lon: number, precisionM: number): number[][] {
  const [e, n] = toUtm(lon, lat)
  const e0 = Math.floor(e / precisionM) * precisionM
  const n0 = Math.floor(n / precisionM) * precisionM
  const e1 = e0 + precisionM
  const n1 = n0 + precisionM
  return [
    toLonLat(e0, n0),
    toLonLat(e1, n0),
    toLonLat(e1, n1),
    toLonLat(e0, n1),
    toLonLat(e0, n0),
  ]
}

/**
 * Stable id of the MGRS cell (side `precisionM`, zone 32U) containing `(lat, lon)`: the point's UTM
 * easting/northing snapped down to the lattice, as `"<precisionM>:<e0>:<n0>"`. Same lattice as
 * `squareCornersFromCenter`, so the id matches the drawn square. Robust for non-decade precisions
 * (2 km / 5 km) where an MGRS digit-string can't uniquely name the cell. (v2 Wave 9, mgrs-cell-index.)
 */
export function cellIdFor(lat: number, lon: number, precisionM: number): string {
  const [e, n] = toUtm(lon, lat)
  const e0 = Math.floor(e / precisionM) * precisionM
  const n0 = Math.floor(n / precisionM) * precisionM
  return `${precisionM}:${e0}:${n0}`
}

/** Formatted MGRS coordinate of the cell's centre — one label shared by every point in the cell. */
export function cellMgrsLabel(lat: number, lon: number, precisionM: number): string {
  const [e, n] = toUtm(lon, lat)
  const cE = Math.floor(e / precisionM) * precisionM + precisionM / 2
  const cN = Math.floor(n / precisionM) * precisionM + precisionM / 2
  const [clon, clat] = toLonLat(cE, cN)
  return formatMgrs(toMgrs(clat, clon))
}

export interface GridLabel {
  lon: number
  lat: number
  label: string
}

/** A compact MGRS label at the centre of each drawn square within the theater. */
export function gridLabels(bbox: BBox, precisionM: number): GridLabel[] {
  const { minE, minN, maxE, maxN } = bboxExtent(bbox)
  const accuracy = precisionToAccuracy(precisionM)
  const labels: GridLabel[] = []
  const firstE = Math.floor(minE / precisionM) * precisionM
  const firstN = Math.floor(minN / precisionM) * precisionM
  for (let e = firstE; e < maxE; e += precisionM) {
    for (let n = firstN; n < maxN; n += precisionM) {
      const cE = e + precisionM / 2
      const cN = n + precisionM / 2
      if (cE < minE || cE > maxE || cN < minN || cN > maxN) continue
      const [lon, lat] = toLonLat(cE, cN)
      labels.push({ lon, lat, label: squareLabel(mgrsForward([lon, lat], accuracy), accuracy) })
    }
  }
  return labels
}
