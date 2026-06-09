import { describe, expect, it } from 'vitest'
import type { UnitUpdate } from '../api/types'
import { firstHaltedUnit } from './halt'

function unit(overrides: Partial<UnitUpdate>): UnitUpdate {
  return {
    type: 'unit_update',
    instance_id: 'inst-1',
    order_id: 'o1',
    lat: 49.2,
    lon: 11.8,
    fuel_l: 1000,
    status: 'active',
    progress_m: 100,
    distance_m: 5000,
    ...overrides,
  }
}

describe('firstHaltedUnit', () => {
  it('returns null when nothing is halted', () => {
    expect(firstHaltedUnit({ a: unit({ status: 'active' }) })).toBeNull()
  })

  it('picks the halted unit and carries reason + slow-mode fuel estimate (v2 W13 F5)', () => {
    const h = firstHaltedUnit({
      a: unit({ status: 'active' }),
      b: unit({
        instance_id: 'inst-2',
        order_id: 'o2',
        status: 'halted',
        reason: 'threat',
        slow_mode_fuel_l: 42.5,
      }),
    })
    expect(h?.instanceId).toBe('inst-2')
    expect(h?.reason).toBe('threat')
    expect(h?.slowModeFuelL).toBe(42.5)
  })

  it('defaults reason to blocked and leaves slow fuel undefined when absent', () => {
    const h = firstHaltedUnit({ b: unit({ status: 'halted' }) })
    expect(h?.reason).toBe('blocked')
    expect(h?.slowModeFuelL).toBeUndefined()
  })
})
