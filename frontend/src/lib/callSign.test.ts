import { describe, expect, it } from 'vitest'
import { unitTypeName } from './callSign'

const types = [
  { id: 'armor-tank-coy', name: 'Armor Tank Company' },
  { id: 'fuel-truck', name: 'Fuel Supply Truck' },
]

describe('unitTypeName', () => {
  it('returns the human type name for a known id', () => {
    expect(unitTypeName('fuel-truck', types)).toBe('Fuel Supply Truck')
  })
  it('returns empty string for an unknown id', () => {
    expect(unitTypeName('nope', types)).toBe('')
  })
})
