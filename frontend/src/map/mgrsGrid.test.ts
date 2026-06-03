import { describe, expect, it } from 'vitest'
import type { BBox } from '../api/types'
import {
  DEFAULT_PRECISION_M,
  GRID_PRECISIONS,
  formatMgrs,
  gridLabels,
  gridLines,
  precisionToAccuracy,
  squareLabel,
  toMgrs,
} from './mgrsGrid'

// The Hohenfels theater bbox (zone 32U).
const BBOX: BBox = { west: 11.78, south: 49.18, east: 11.92, north: 49.27 }

describe('precision table', () => {
  it('offers 100km→100m and defaults to 1km', () => {
    expect(GRID_PRECISIONS.map((p) => p.m)).toEqual([100000, 10000, 1000, 100])
    expect(DEFAULT_PRECISION_M).toBe(1000)
  })

  it('maps drawn precision to MGRS digit-accuracy', () => {
    expect(precisionToAccuracy(100000)).toBe(0)
    expect(precisionToAccuracy(10000)).toBe(1)
    expect(precisionToAccuracy(1000)).toBe(2)
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
