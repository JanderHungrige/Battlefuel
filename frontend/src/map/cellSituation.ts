// Pure aggregation of the H3 tiles within an MGRS cell into one "cell situation" for inspection
// (v2 Wave 9, mgrs-cell-aggregation). No canvas/MapLibre — unit-testable. The single aggregation
// rule; the backend /mgrs-cells endpoint mirrors it.

import type { TerrainType, Tile } from '../api/types'

type RoadCondition = Tile['road_condition'] // 'clear' | 'damaged' | 'blocked'
type IntelLevel = Tile['intel_level'] // 'none' | 'low' | 'medium' | 'high'

/** Worst-case ordering (higher = more significant for the threat picture). */
const ROAD_RANK: Record<RoadCondition, number> = { clear: 0, damaged: 1, blocked: 2 }
const INTEL_RANK: Record<IntelLevel, number> = { none: 0, low: 1, medium: 2, high: 3 }
const ROAD_BY_RANK: RoadCondition[] = ['clear', 'damaged', 'blocked']
const INTEL_BY_RANK: IntelLevel[] = ['none', 'low', 'medium', 'high']

/** Stable terrain order for dominant-terrain tie-breaking. */
const TERRAIN_ORDER: TerrainType[] = [
  'military',
  'urban',
  'forest',
  'farmland',
  'wetland',
  'water',
  'open',
  'unknown',
]

/** The aggregated situation of one MGRS cell. */
export interface CellSituation {
  count: number
  maxThreat: number
  worstRoad: RoadCondition
  maxIntel: IntelLevel
  dominantTerrain: TerrainType
  terrainMix: Partial<Record<TerrainType, number>>
}

type CellTile = Pick<Tile, 'threat_level' | 'road_condition' | 'intel_level' | 'terrain'>

/** Aggregate the tiles in one MGRS cell. Worst-case for threat/road/intel; dominant for terrain. */
export function aggregateCell(tiles: CellTile[]): CellSituation {
  if (tiles.length === 0) {
    return {
      count: 0,
      maxThreat: 0,
      worstRoad: 'clear',
      maxIntel: 'none',
      dominantTerrain: 'unknown',
      terrainMix: {},
    }
  }

  let maxThreat = 0
  let worstRoadRank = 0
  let maxIntelRank = 0
  const terrainMix: Partial<Record<TerrainType, number>> = {}

  for (const t of tiles) {
    if (t.threat_level > maxThreat) maxThreat = t.threat_level
    worstRoadRank = Math.max(worstRoadRank, ROAD_RANK[t.road_condition] ?? 0)
    maxIntelRank = Math.max(maxIntelRank, INTEL_RANK[t.intel_level] ?? 0)
    terrainMix[t.terrain] = (terrainMix[t.terrain] ?? 0) + 1
  }

  // Dominant terrain: highest count, ties broken by TERRAIN_ORDER.
  let dominantTerrain: TerrainType = 'unknown'
  let bestCount = -1
  for (const terrain of TERRAIN_ORDER) {
    const c = terrainMix[terrain] ?? 0
    if (c > bestCount) {
      bestCount = c
      dominantTerrain = terrain
    }
  }

  return {
    count: tiles.length,
    maxThreat,
    worstRoad: ROAD_BY_RANK[worstRoadRank],
    maxIntel: INTEL_BY_RANK[maxIntelRank],
    dominantTerrain,
    terrainMix,
  }
}
