// Pure helpers for the sim WebSocket: parse and reduce frames. Kept free of the
// WebSocket API so they are deterministically unit-testable.

import type { TileUpdate, UnitUpdate } from '../api/types'

function parse(raw: string): Record<string, unknown> | null {
  try {
    const msg: unknown = JSON.parse(raw)
    return typeof msg === 'object' && msg !== null ? (msg as Record<string, unknown>) : null
  } catch {
    console.warn('[simSocket] dropping malformed WS frame')
    return null
  }
}

/** Parse a raw WS frame into a UnitUpdate, or null if it is not a valid unit_update. */
export function parseUnitUpdate(raw: string): UnitUpdate | null {
  const msg = parse(raw)
  if (msg && msg.type === 'unit_update' && typeof msg.instance_id === 'string') {
    return msg as unknown as UnitUpdate
  }
  return null
}

/** Parse a raw WS frame into a TileUpdate, or null if it is not a valid tile_update. */
export function parseTileUpdate(raw: string): TileUpdate | null {
  const msg = parse(raw)
  if (msg && msg.type === 'tile_update' && typeof msg.h3_index === 'string') {
    return msg as unknown as TileUpdate
  }
  return null
}

/** Latest tile frame per h3_index wins. Returns a new map (never mutates the input). */
export function applyTileUpdate(
  state: Record<string, TileUpdate>,
  update: TileUpdate,
): Record<string, TileUpdate> {
  return { ...state, [update.h3_index]: update }
}

/** Latest frame per instance wins. Returns a new map (never mutates the input). */
export function applyUnitUpdate(
  state: Record<string, UnitUpdate>,
  update: UnitUpdate,
): Record<string, UnitUpdate> {
  return { ...state, [update.instance_id]: update }
}
