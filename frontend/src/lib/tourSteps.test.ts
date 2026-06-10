import { describe, expect, it } from 'vitest'
import { stepsForRole } from './tourSteps'

describe('stepsForRole', () => {
  it('includes the shared intro/map/replay steps for both roles', () => {
    for (const role of ['OF4', 'OF8'] as const) {
      const sel = stepsForRole(role).map((s) => s.selector)
      expect(sel).toContain('.topbar .brand')
      expect(sel).toContain('[data-testid="role-toggle"]')
      expect(sel).toContain('.map-area')
      expect(sel).toContain('.tour') // replay step points at the Take-a-tour button
    }
  })

  it('shows OF-8 supply tools only in the supply view', () => {
    const of8 = stepsForRole('OF8').map((s) => s.selector)
    expect(of8).toContain('[data-testid="depot-mode-toggle"]')
    expect(of8).toContain('[data-testid="supply-panel"]')
    expect(of8).not.toContain('[data-testid="obstacle-mode-toggle"]')
  })

  it('shows OF-4 tactical tools only in the tactical view', () => {
    const of4 = stepsForRole('OF4').map((s) => s.selector)
    expect(of4).toContain('[data-testid="obstacle-mode-toggle"]')
    expect(of4).not.toContain('[data-testid="supply-panel"]')
  })

  it('every step has a non-empty title and caption', () => {
    for (const role of ['OF4', 'OF8'] as const) {
      for (const step of stepsForRole(role)) {
        expect(step.title.length).toBeGreaterThan(0)
        expect(step.text.length).toBeGreaterThan(0)
      }
    }
  })
})
