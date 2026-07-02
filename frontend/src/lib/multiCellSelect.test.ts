import { describe, expect, it } from 'vitest'
import type { Tile } from '../api/types'
import { type CellPoint, cellsToH3Indexes, toggleCell } from './multiCellSelect'

const P = 1000 // 1 km cells

const tile = (h3: string, lat: number, lon: number): Tile => ({
  h3_index: h3,
  resolution: 8,
  center_lat: lat,
  center_lon: lon,
  terrain: 'open',
  threat_level: 0,
  intel_level: 'none',
  weather: 'clear',
  road_condition: 'clear',
  cover: 'none',
  boundary: [],
})

describe('toggleCell', () => {
  const a: CellPoint = { lat: 49.215, lon: 11.835 }
  it('adds a new cell', () => {
    expect(toggleCell([], a, P)).toHaveLength(1)
  })
  it('removes a cell already in the same MGRS cell', () => {
    const near = { lat: a.lat + 0.0001, lon: a.lon + 0.0001 } // same 1 km cell
    expect(toggleCell([a], near, P)).toEqual([])
  })
  it('keeps distinct cells', () => {
    const far = { lat: 49.25, lon: 11.88 }
    expect(toggleCell([a], far, P)).toHaveLength(2)
  })
})

describe('cellsToH3Indexes', () => {
  const tiles = [
    tile('h-a1', 49.215, 11.835),
    tile('h-a2', 49.2152, 11.8352), // same 1 km cell as h-a1
    tile('h-b1', 49.25, 11.88), // different cell
  ]
  it('is empty with no selection', () => {
    expect(cellsToH3Indexes([], tiles, P)).toEqual([])
  })
  it('collects every H3 tile in the selected cells, deduped', () => {
    const got = cellsToH3Indexes([{ lat: 49.215, lon: 11.835 }], tiles, P).sort()
    expect(got).toEqual(['h-a1', 'h-a2'])
  })
  it('unions across multiple selected cells', () => {
    const got = cellsToH3Indexes(
      [
        { lat: 49.215, lon: 11.835 },
        { lat: 49.25, lon: 11.88 },
      ],
      tiles,
      P,
    ).sort()
    expect(got).toEqual(['h-a1', 'h-a2', 'h-b1'])
  })
})
