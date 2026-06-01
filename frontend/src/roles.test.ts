import { describe, expect, it } from 'vitest'
import { canShow, ROLES } from './roles'

describe('roles registry', () => {
  it('exposes OF-4 and OF-8', () => {
    expect(ROLES.map((r) => r.id)).toEqual(['OF4', 'OF8'])
  })

  it('OF-4 shows tactical tools, not supply panels', () => {
    expect(canShow('OF4', 'moveRoutes')).toBe(true)
    expect(canShow('OF4', 'obstacleMode')).toBe(true)
    expect(canShow('OF4', 'supplyPanel')).toBe(false)
  })

  it('OF-8 shows supply panels, not tactical tools', () => {
    expect(canShow('OF8', 'supplyPanel')).toBe(true)
    expect(canShow('OF8', 'depotOverlay')).toBe(true)
    expect(canShow('OF8', 'moveRoutes')).toBe(false)
    expect(canShow('OF8', 'obstacleMode')).toBe(false)
  })

  it('inspect and chatter are shared by both roles', () => {
    for (const r of ['OF4', 'OF8'] as const) {
      expect(canShow(r, 'inspect')).toBe(true)
      expect(canShow(r, 'chatter')).toBe(true)
    }
  })
})
