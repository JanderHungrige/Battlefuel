import { describe, expect, it } from 'vitest'
import type { BBox } from '../api/types'
import {
  DEFAULT_PRECISION_M,
  GRID_PRECISIONS,
  cellIdFor,
  cellMgrsLabel,
  formatMgrs,
  gridLabels,
  gridLines,
  precisionToAccuracy,
  squareCornersFromCenter,
  squareLabel,
  toMgrs,
} from './mgrsGrid'

// The Hohenfels theater bbox (zone 32U).
const BBOX: BBox = { west: 11.78, south: 49.18, east: 11.92, north: 49.27 }

describe('precision table', () => {
  it('offers 100km→100m incl. 5/2km + 500m, and defaults to 1km', () => {
    expect(GRID_PRECISIONS.map((p) => p.m)).toEqual([100000, 10000, 5000, 2000, 1000, 500, 100])
    expect(DEFAULT_PRECISION_M).toBe(1000)
  })

  it('maps drawn precision to a digit-accuracy that distinguishes adjacent squares', () => {
    expect(precisionToAccuracy(100000)).toBe(0)
    expect(precisionToAccuracy(10000)).toBe(1)
    expect(precisionToAccuracy(5000)).toBe(2)
    expect(precisionToAccuracy(2000)).toBe(2)
    expect(precisionToAccuracy(1000)).toBe(2)
    expect(precisionToAccuracy(500)).toBe(3)
    expect(precisionToAccuracy(100)).toBe(3)
  })
})

describe('toMgrs / formatMgrs', () => {
  it('produces a 1 m MGRS string in zone 32U for a theater point', () => {
    const s = toMgrs(49.22, 11.85, 5)
    expect(s).toMatch(/^32U[A-Z]{2}\d{10}$/)
    expect(s.startsWith('32U')).toBe(true)
  })

  it('pretty-prints GZD / square / easting / northing', () => {
    expect(formatMgrs('32UQV0752455822')).toBe('32U QV 07524 55822')
    expect(formatMgrs('32UQV')).toBe('32U QV')
  })
})

describe('squareLabel', () => {
  it('gives the 100 km square id at accuracy 0 and the digit pair otherwise', () => {
    expect(squareLabel('32UQV', 0)).toBe('QV')
    expect(squareLabel('32UQV0755', 2)).toBe('07 55')
    expect(squareLabel('32UQV05', 1)).toBe('0 5')
  })
})

describe('gridLines', () => {
  it('returns travel-ordered [lon,lat] polylines covering the theater', () => {
    const lines = gridLines(BBOX, 1000)
    expect(lines.length).toBeGreaterThan(4) // a 1km grid over ~15km has many lines
    for (const line of lines) {
      expect(line.length).toBeGreaterThanOrEqual(2)
      for (const [lon, lat] of line) {
        expect(lon).toBeGreaterThan(11.6)
        expect(lon).toBeLessThan(12.1)
        expect(lat).toBeGreaterThan(49.0)
        expect(lat).toBeLessThan(49.5)
      }
    }
  })

  it('draws fewer lines at coarser precision', () => {
    expect(gridLines(BBOX, 10000).length).toBeLessThan(gridLines(BBOX, 1000).length)
  })
})

describe('squareCornersFromCenter', () => {
  const CTR_LAT = 49.215
  const CTR_LON = 11.835

  it('returns a closed ring of 5 [lon,lat] points', () => {
    const ring = squareCornersFromCenter(CTR_LAT, CTR_LON, 1000)
    expect(ring).toHaveLength(5)
    expect(ring[0]).toEqual(ring[4]) // closed
    for (const [lon, lat] of ring) {
      expect(lon).toBeGreaterThan(11.7)
      expect(lon).toBeLessThan(11.95)
      expect(lat).toBeGreaterThan(49.1)
      expect(lat).toBeLessThan(49.3)
    }
  })

  it('contains its centre point', () => {
    const ring = squareCornersFromCenter(CTR_LAT, CTR_LON, 1000)
    const lons = ring.map((p) => p[0])
    const lats = ring.map((p) => p[1])
    expect(Math.min(...lons)).toBeLessThanOrEqual(CTR_LON)
    expect(Math.max(...lons)).toBeGreaterThanOrEqual(CTR_LON)
    expect(Math.min(...lats)).toBeLessThanOrEqual(CTR_LAT)
    expect(Math.max(...lats)).toBeGreaterThanOrEqual(CTR_LAT)
  })

  it('draws a larger box at a coarser precision', () => {
    const span = (p: number): number => {
      const ring = squareCornersFromCenter(CTR_LAT, CTR_LON, p)
      const lons = ring.map((c) => c[0])
      return Math.max(...lons) - Math.min(...lons)
    }
    expect(span(2000)).toBeGreaterThan(span(100))
  })

  it('is deterministic and lattice-aligned (a ~1km-shifted point lands in a different cell)', () => {
    expect(squareCornersFromCenter(CTR_LAT, CTR_LON, 1000)).toEqual(
      squareCornersFromCenter(CTR_LAT, CTR_LON, 1000),
    )
    // ~0.012° lat ≈ 1.3 km north → a different 1 km cell → a different square.
    const here = squareCornersFromCenter(CTR_LAT, CTR_LON, 1000)
    const north = squareCornersFromCenter(CTR_LAT + 0.012, CTR_LON, 1000)
    expect(north).not.toEqual(here)
  })
})

describe('gridLabels', () => {
  it('labels each drawn square within the theater', () => {
    const labels = gridLabels(BBOX, 1000)
    expect(labels.length).toBeGreaterThan(4)
    for (const l of labels) {
      expect(l.lon).toBeGreaterThan(11.7)
      expect(l.lon).toBeLessThan(11.95)
      expect(l.label).toMatch(/^\d{2} \d{2}$/) // 1km → "EE NN"
    }
  })
})

describe('cellIdFor', () => {
  const LAT = 49.215
  const LON = 11.835

  it('is deterministic and groups nearby points into the same 1km cell id', () => {
    const a = cellIdFor(LAT, LON, 1000)
    expect(cellIdFor(LAT, LON, 1000)).toBe(a)
    expect(a).toMatch(/^1000:\d+:\d+$/)
  })

  it('puts a ~1.3km-shifted point in a different cell', () => {
    expect(cellIdFor(LAT + 0.012, LON, 1000)).not.toBe(cellIdFor(LAT, LON, 1000))
  })

  it('encodes the precision (coarser precision → different id)', () => {
    expect(cellIdFor(LAT, LON, 2000)).not.toBe(cellIdFor(LAT, LON, 1000))
    expect(cellIdFor(LAT, LON, 2000).startsWith('2000:')).toBe(true)
  })

  it('matches the drawn square: a square corner shares the cell of its centre', () => {
    // The SW-ish interior of the square that contains the point shares the point's cell id.
    const ring = squareCornersFromCenter(LAT, LON, 1000)
    // nudge inward from the SW corner so we stay inside the cell
    const [swLon, swLat] = ring[0]
    expect(cellIdFor(swLat + 0.0005, swLon + 0.0005, 1000)).toBe(cellIdFor(LAT, LON, 1000))
  })
})

describe('cellMgrsLabel', () => {
  it('returns one formatted MGRS string shared by all points in the cell', () => {
    const a = cellMgrsLabel(49.215, 11.835, 1000)
    const b = cellMgrsLabel(49.2156, 11.8356, 1000) // same 1km cell (small nudge)
    expect(a).toMatch(/^32U [A-Z]{2} /)
    expect(b).toBe(a)
  })
})
