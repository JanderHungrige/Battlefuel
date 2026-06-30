import { describe, expect, it } from 'vitest'
import type { Tile } from '../api/types'
import type { TileEvent } from '../api/types'
import { DEFAULT_THREAT_PRECISION_M, threatSquares, tilePrecisionM } from './threatGrid'

const tile = (lat: number, lon: number, threat: number, event?: Partial<TileEvent>): Tile => ({
  h3_index: `${lat}:${lon}`,
  resolution: 8,
  center_lat: lat,
  center_lon: lon,
  terrain: 'open',
  threat_level: threat,
  intel_level: 'none',
  weather: 'clear',
  road_condition: 'clear',
  cover: 'none',
  boundary: [],
  last_event: event
    ? {
        headline: 'x',
        category: 'c',
        sender: 's',
        supply_relevant: false,
        at_game_s: 0,
        ...event,
      }
    : null,
})

describe('tilePrecisionM', () => {
  it('uses the located-event precision when present', () => {
    expect(tilePrecisionM(tile(49.2, 11.8, 3, { precision_m: 500 }))).toBe(500)
  })
  it('falls back to the ambient default with no event', () => {
    expect(tilePrecisionM(tile(49.2, 11.8, 3))).toBe(DEFAULT_THREAT_PRECISION_M)
  })
})

describe('threatSquares', () => {
  it('drops zero-threat tiles', () => {
    expect(threatSquares([tile(49.2, 11.8, 0)])).toEqual([])
  })

  it('emits one square per (precision, cell), taking the max level', () => {
    // Two tiles in the same 1 km cell → one square at the max level.
    const sq = threatSquares([tile(49.215, 11.835, 2), tile(49.2152, 11.8352, 4)])
    expect(sq).toHaveLength(1)
    expect(sq[0].threat).toBe(4)
    expect(sq[0].precisionM).toBe(DEFAULT_THREAT_PRECISION_M)
  })

  it('keeps a smaller-grid-code threat separate from a larger one (own resolution)', () => {
    // A 500 m located threat nested inside a default 1 km ambient threat → two distinct squares.
    const sq = threatSquares([
      tile(49.215, 11.835, 2),
      tile(49.2151, 11.8351, 4, { precision_m: 500 }),
    ])
    expect(sq).toHaveLength(2)
    expect(sq.map((s) => s.precisionM).sort((a, b) => a - b)).toEqual([500, 1000])
  })

  it('sorts ascending by level so higher threats paint over lower', () => {
    const sq = threatSquares([
      tile(49.20, 11.80, 4, { precision_m: 500 }),
      tile(49.25, 11.88, 1, { precision_m: 500 }),
      tile(49.22, 11.84, 2, { precision_m: 500 }),
    ])
    expect(sq.map((s) => s.threat)).toEqual([1, 2, 4])
  })
})
