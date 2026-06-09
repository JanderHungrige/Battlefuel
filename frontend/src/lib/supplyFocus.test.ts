import { describe, expect, it } from 'vitest'
import { dimDepots, dimmedUnitIds } from './supplyFocus'

const units = ['inst-armor-1', 'inst-inf-1', 'inst-fuel-1', 'inst-fuel-2']
const trucks = ['inst-fuel-1', 'inst-fuel-2']

describe('dimmedUnitIds', () => {
  it('overview: dims non-truck NATO units, keeps the fleet bright', () => {
    expect(dimmedUnitIds('overview', units, trucks).sort()).toEqual(['inst-armor-1', 'inst-inf-1'])
  })

  it('fleet: dims non-truck NATO units, keeps the fleet bright', () => {
    expect(dimmedUnitIds('fleet', units, trucks).sort()).toEqual(['inst-armor-1', 'inst-inf-1'])
  })

  it('order: dims all units (trucks included — only depots matter)', () => {
    expect(dimmedUnitIds('order', units, trucks).sort()).toEqual([...units].sort())
  })
})

describe('dimDepots', () => {
  it('dims depots only on the supply-fleet tab', () => {
    expect(dimDepots('overview')).toBe(false)
    expect(dimDepots('fleet')).toBe(true)
    expect(dimDepots('order')).toBe(false)
  })
})
