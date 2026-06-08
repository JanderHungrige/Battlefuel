import { describe, expect, it } from 'vitest'
import { shouldRefuelOnClick } from './refuelOnClick'

describe('shouldRefuelOnClick', () => {
  const targets = ['inst-armor-1', 'inst-recon-2']

  it('refuels a valid target clicked in the OF-8 view', () => {
    expect(shouldRefuelOnClick('OF8', targets, 'inst-armor-1')).toBe(true)
  })

  it('does not refuel in the OF-4 view', () => {
    expect(shouldRefuelOnClick('OF4', targets, 'inst-armor-1')).toBe(false)
  })

  it('does not refuel a non-target (e.g. a fuel truck) in OF-8', () => {
    expect(shouldRefuelOnClick('OF8', targets, 'inst-fuel-1')).toBe(false)
  })
})
