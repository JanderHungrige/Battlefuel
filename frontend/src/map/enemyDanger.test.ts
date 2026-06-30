import { describe, expect, it } from 'vitest'
import {
  DANGER_CELL_M,
  ENEMY_DANGER_RADIUS_M,
  dangerCells,
  dangerCircle,
  distanceM,
} from './enemyDanger'

const E = { lat: 49.225, lon: 11.86 }

describe('distanceM', () => {
  it('is ~0 at the same point and grows with separation', () => {
    expect(distanceM(E.lat, E.lon, E.lat, E.lon)).toBeCloseTo(0, 5)
    const d = distanceM(E.lat, E.lon, E.lat + 0.01, E.lon) // ~1.1 km north
    expect(d).toBeGreaterThan(1000)
    expect(d).toBeLessThan(1200)
  })
})

describe('dangerCircle', () => {
  it('is a closed ring whose vertices sit ~radius from the centre', () => {
    const ring = dangerCircle(E.lat, E.lon, ENEMY_DANGER_RADIUS_M)
    expect(ring[0]).toEqual(ring[ring.length - 1]) // closed
    for (const [lon, lat] of ring) {
      expect(distanceM(E.lat, E.lon, lat, lon)).toBeCloseTo(ENEMY_DANGER_RADIUS_M, -1)
    }
  })
})

describe('dangerCells', () => {
  it('returns the distinct 500 m cells covered, all within the radius', () => {
    const cells = dangerCells([E], ENEMY_DANGER_RADIUS_M, DANGER_CELL_M)
    expect(cells.length).toBeGreaterThan(0)
    // Every representative point lies inside the danger circle.
    for (const c of cells) {
      expect(distanceM(E.lat, E.lon, c.lat, c.lon)).toBeLessThanOrEqual(ENEMY_DANGER_RADIUS_M)
    }
    // A 1 km-diameter circle over 500 m cells touches several distinct cells.
    expect(cells.length).toBeGreaterThanOrEqual(4)
  })

  it('returns nothing when there are no enemies', () => {
    expect(dangerCells([], ENEMY_DANGER_RADIUS_M, DANGER_CELL_M)).toEqual([])
  })

  it('merges overlapping coverage from two close enemies (deduped cells)', () => {
    const near = { lat: E.lat + 0.0005, lon: E.lon + 0.0005 } // ~70 m away
    const one = dangerCells([E], ENEMY_DANGER_RADIUS_M, DANGER_CELL_M).length
    const two = dangerCells([E, near], ENEMY_DANGER_RADIUS_M, DANGER_CELL_M).length
    // Heavy overlap → far fewer than 2x the single-enemy cell count.
    expect(two).toBeLessThan(one * 2)
  })
})
