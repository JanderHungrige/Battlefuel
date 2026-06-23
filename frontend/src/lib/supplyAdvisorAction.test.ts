import { describe, expect, it } from 'vitest'
import { supplyAdviceKind } from './supplyAdvisorAction'

describe('supplyAdviceKind', () => {
  it('maps Refueling & Fuel events to a refuel plan', () => {
    expect(supplyAdviceKind('Refueling & Fuel')).toBe('refuel')
  })

  it('maps Movement & Access disruptions to a reposition warning', () => {
    expect(supplyAdviceKind('Movement & Access')).toBe('reposition')
  })

  it('maps supply-chain / logistics and anything else to redistribution', () => {
    expect(supplyAdviceKind('Supply Chain & Rearming')).toBe('redistribution')
    expect(supplyAdviceKind('Logistics & Support')).toBe('redistribution')
    expect(supplyAdviceKind('Threat Events')).toBe('redistribution')
  })
})
