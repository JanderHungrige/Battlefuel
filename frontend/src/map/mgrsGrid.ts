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
