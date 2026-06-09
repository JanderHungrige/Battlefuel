// Halt detection (v2 Wave 10 F1/F4): pick the unit that has halted at an obstruction from the
// live WebSocket state, so the UI can offer "Proceed slowly" or "Re-route". Pure + unit-testable.

import type { UnitUpdate } from '../api/types'

export interface HaltedUnit {
  instanceId: string
  orderId: string
  reason: 'blocked' | 'threat'
  lat: number
  lon: number
  /** Adjusted fuel to crawl the remaining threat tiles slowly, when the backend estimated it. */
  slowModeFuelL?: number
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
        slowModeFuelL: u.slow_mode_fuel_l,
      }
    }
  }
  return null
}
