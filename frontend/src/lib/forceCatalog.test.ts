import { describe, expect, it } from 'vitest'
import type { UnitType } from '../api/types'
import { unitTab, unitsForTab } from './forceCatalog'

const ut = (id: string, nato: string): UnitType => ({
  id,
  name: id.toUpperCase(),
  nato_unit_type: nato,
  echelon: 'company',
  sidc: '10031000151205000000',
  recon_level: 'none',
  fuel: {
    fuel_type: 'diesel',
    capacity_liters: 1000,
    consumption_normal_lph: 10,
    consumption_combat_lph: 20,
    consumption_idle_lph: 1,
  },
  endurance_hours_normal: null,
  endurance_hours_combat: null,
  description: null,
})

describe('unitTab', () => {
  it('puts fuel supply and logistics on the fuel tab', () => {
    expect(unitTab(ut('a', 'fuel_supply'))).toBe('fuel')
    expect(unitTab(ut('b', 'logistics'))).toBe('fuel')
  })
  it('puts every other unit type on the troops tab', () => {
    expect(unitTab(ut('c', 'armor'))).toBe('troops')
    expect(unitTab(ut('d', 'infantry'))).toBe('troops')
    expect(unitTab(ut('e', 'headquarters'))).toBe('troops')
  })
})

describe('unitsForTab', () => {
  const units = [
    ut('zulu', 'armor'),
    ut('alpha', 'infantry'),
    ut('tanker', 'fuel_supply'),
    ut('truck', 'logistics'),
  ]
  it('returns only the tab members, sorted by name', () => {
    expect(unitsForTab(units, 'fuel').map((u) => u.id)).toEqual(['tanker', 'truck'])
    expect(unitsForTab(units, 'troops').map((u) => u.name)).toEqual(['ALPHA', 'ZULU'])
  })
})
