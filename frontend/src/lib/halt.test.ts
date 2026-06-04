import { describe, expect, it } from 'vitest'
import type { UnitUpdate } from '../api/types'
import { firstHaltedUnit } from './halt'

function frame(over: Partial<UnitUpdate>): UnitUpdate {
  return {
    type: 'unit_update',
    instance_id: 'i1',
    order_id: 'o1',
    lat: 49.2,
    lon: 11.8,
    fuel_l: 100,
    status: 'active',
    progress_m: 0,
    distance_m: 1000,
    ...over,
  }
}

describe('firstHaltedUnit', () => {
  it('returns null when no unit is halted', () => {
    const live = { i1: frame({ status: 'active' }), i2: frame({ status: 'complete' }) }
    expect(firstHaltedUnit(live)).toBeNull()
  })

  it('finds a halted unit and surfaces its order, reason, and position', () => {
    const live = {
      i1: frame({ instance_id: 'i1', status: 'active' }),
      i2: frame({ instance_id: 'i2', order_id: 'o9', status: 'halted', reason: 'threat', lat: 49.3 }),
    }
    const h = firstHaltedUnit(live)
    expect(h).not.toBeNull()
    expect(h?.instanceId).toBe('i2')
    expect(h?.orderId).toBe('o9')
    expect(h?.reason).toBe('threat')
    expect(h?.lat).toBe(49.3)
  })

  it('defaults the reason to blocked when the frame omits it', () => {
    const live = { i1: frame({ status: 'halted', reason: undefined }) }
    expect(firstHaltedUnit(live)?.reason).toBe('blocked')
  })
})
