// Pure helpers for the sim WebSocket: parse and reduce frames. Kept free of the
// WebSocket API so they are deterministically unit-testable.

import type { UnitUpdate } from '../api/types'

/** Parse a raw WS frame into a UnitUpdate, or null if it is not a valid unit_update. */
export function parseUnitUpdate(raw: string): UnitUpdate | null {
  let msg: unknown
  try {
    msg = JSON.parse(raw)
  } catch {
    console.warn('[simSocket] dropping malformed WS frame')
    return null
  }
  if (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'unit_update' &&
    typeof (msg as { instance_id?: unknown }).instance_id === 'string'
  ) {
    return msg as UnitUpdate
  }
  return null
}

/** Latest frame per instance wins. Returns a new map (never mutates the input). */
export function applyUnitUpdate(
  state: Record<string, UnitUpdate>,
  update: UnitUpdate,
): Record<string, UnitUpdate> {
  return { ...state, [update.instance_id]: update }
}
