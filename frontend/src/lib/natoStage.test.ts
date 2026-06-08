import { describe, expect, it } from 'vitest'
import { NATO_STAGES, isFinalStage, natoStageIndex, natoStageLabel } from './natoStage'

describe('natoStage', () => {
  it('has the seven NATO stages in order', () => {
    expect(NATO_STAGES).toEqual([
      'placed',
      'confirmed_jlsg',
      'confirmed_jtf',
      'confirmed_provider',
      'on_route',
      'reached_jlsg',
      'reached_opcon',
    ])
  })

  it('labels each stage in operator language', () => {
    expect(natoStageLabel('placed')).toBe('Order placed')
    expect(natoStageLabel('confirmed_provider')).toBe('Confirmed by Fuel Provider')
    expect(natoStageLabel('reached_opcon')).toBe('Fuel reached OPCON')
  })

  it('falls back to "Order placed" for a missing stage', () => {
    expect(natoStageLabel(null)).toBe('Order placed')
    expect(natoStageLabel(undefined)).toBe('Order placed')
  })

  it('indexes stages and detects the final stage', () => {
    expect(natoStageIndex('placed')).toBe(0)
    expect(natoStageIndex('reached_opcon')).toBe(6)
    expect(natoStageIndex(undefined)).toBe(0)
    expect(isFinalStage('reached_opcon')).toBe(true)
    expect(isFinalStage('on_route')).toBe(false)
  })
})
