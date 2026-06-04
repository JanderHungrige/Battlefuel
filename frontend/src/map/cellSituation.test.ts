import { describe, expect, it } from 'vitest'
import type { Tile } from '../api/types'
import { aggregateCell } from './cellSituation'

type CellTile = Pick<Tile, 'threat_level' | 'road_condition' | 'intel_level' | 'terrain'>

const t = (over: Partial<CellTile> = {}): CellTile => ({
  threat_level: 0,
  road_condition: 'clear',
  intel_level: 'none',
  terrain: 'open',
  ...over,
})

describe('aggregateCell', () => {
  it('returns a zeroed situation for an empty cell', () => {
    expect(aggregateCell([])).toEqual({
      count: 0,
      maxThreat: 0,
      worstRoad: 'clear',
      maxIntel: 'none',
      dominantTerrain: 'unknown',
      terrainMix: {},
    })
  })

  it('takes the worst-case threat, road, and intel across tiles', () => {
    const s = aggregateCell([
      t({ threat_level: 1, road_condition: 'clear', intel_level: 'low' }),
      t({ threat_level: 4, road_condition: 'blocked', intel_level: 'medium' }),
      t({ threat_level: 2, road_condition: 'damaged', intel_level: 'high' }),
    ])
    expect(s.count).toBe(3)
    expect(s.maxThreat).toBe(4)
    expect(s.worstRoad).toBe('blocked')
    expect(s.maxIntel).toBe('high')
  })

  it('picks the dominant terrain by count and reports the mix', () => {
    const s = aggregateCell([
      t({ terrain: 'forest' }),
      t({ terrain: 'forest' }),
      t({ terrain: 'urban' }),
    ])
    expect(s.dominantTerrain).toBe('forest')
    expect(s.terrainMix).toEqual({ forest: 2, urban: 1 })
  })

  it('breaks terrain ties by significance order (military > open)', () => {
    const s = aggregateCell([t({ terrain: 'open' }), t({ terrain: 'military' })])
    expect(s.dominantTerrain).toBe('military') // 1–1 tie → higher-significance wins
  })
})
