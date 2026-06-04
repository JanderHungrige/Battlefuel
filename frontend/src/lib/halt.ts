// Halt detection (v2 Wave 10 F1/F4): pick the unit that has halted at an obstruction from the
// live WebSocket state, so the UI can offer "Proceed slowly" or "Re-route". Pure + unit-testable.

import type { UnitUpdate } from '../api/types'

export interface HaltedUnit {
  instanceId: string
  orderId: string
  reason: 'blocked' | 'threat'
  lat: number
  lon: number
}

/** The first unit currently halted at an obstruction (status 'halted'), or null. */
export function firstHaltedUnit(live: Record<string, UnitUpdate>): HaltedUnit | null {
  for (const u of Object.values(live)) {
    if (u.status === 'halted') {
      return {
        instanceId: u.instance_id,
        orderId: u.order_id,
        reason: u.reason ?? 'blocked',
        lat: u.lat,
        lon: u.lon,
      }
    }
  }
  return null
}
