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

  it('covers the OF-4 routing depth: travel modes, safe/fast, waypoints, refuel-stop & rendezvous', () => {
    const of4 = stepsForRole('OF4')
    const sel = of4.map((s) => s.selector)
    expect(sel).toContain('[data-testid="obstacle-mode-toggle"]')
    expect(sel).toContain('.move-mode') // travel mode selector
    expect(sel).toContain('[data-testid="wp-start"]') // waypoint routing
    // the panel is highlighted for both safe/fast and refuel/rendezvous explanations
    expect(sel.filter((s) => s === '.move-panel').length).toBeGreaterThanOrEqual(2)
    // it must open the Plan-move panel by selecting a demo unit first
    expect(of4.some((s) => s.before?.action === 'select-unit')).toBe(true)
    expect(sel).not.toContain('[data-testid="supply-panel"]')
  })

  it('covers the OF-8 Joint-Force Supply tab and all three sub-tabs', () => {
    const of8 = stepsForRole('OF8')
    const sel = of8.map((s) => s.selector)
    expect(sel).toContain('[data-testid="supply-panel"]')
    expect(sel).toContain('[data-testid="fleet-summary"]') // Overview content
    expect(sel).toContain('[data-testid^="fuel-run-start-"]') // Supply fleet: Create fuel run
    expect(sel).toContain('[data-testid^="rdv-start-"]') // Supply fleet: Plan rendezvous
    expect(sel).toContain('[data-testid="plan-rendezvous-panel"]') // demo'd rendezvous planner
    expect(sel).toContain('[data-testid="buy-submit"]') // Order fuel content
    expect(sel).toContain('[data-testid="refuel-submit"]')
    expect(sel).toContain('[data-testid="order-history-open"]')
    expect(sel).toContain('[data-testid="info-docs-open"]')
    expect(sel).not.toContain('[data-testid="obstacle-mode-toggle"]')
  })

  it('switches each OF-8 sub-tab via a before-click so its content is mounted', () => {
    const clicks = stepsForRole('OF8')
      .map((s) => s.before?.click)
      .filter((c): c is string => Boolean(c))
    expect(clicks).toContain('[data-testid="supply-tab-overview"]')
    expect(clicks).toContain('[data-testid="supply-tab-fleet"]')
    expect(clicks).toContain('[data-testid="supply-tab-order"]')
  })

  it('opens then closes the rendezvous planner around its demo step', () => {
    const actions = stepsForRole('OF8')
      .map((s) => s.before?.action)
      .filter((a): a is NonNullable<typeof a> => Boolean(a))
    expect(actions).toContain('plan-rendezvous')
    expect(actions).toContain('cancel-rendezvous')
  })

  it('shows the shared scenario-building tools (graph, forces, multi-tile, scenarios) for both roles', () => {
    for (const role of ['OF4', 'OF8'] as const) {
      const steps = stepsForRole(role)
      const sel = steps.map((s) => s.selector)
      // graph overlay + each scenario tool anchor and its revealed panel
      expect(sel).toContain('[data-testid="graph-overlay-toggle"]')
      expect(sel).toContain('[data-testid="force-place-toggle"]')
      expect(sel).toContain('[data-testid="force-placement-panel"]')
      expect(sel).toContain('[data-testid="multi-cell-panel"]')
      expect(sel).toContain('[data-testid="scenario-toggle"]')
      expect(sel).toContain('[data-testid="scenario-panel"]')
      // the panels are revealed by demo actions before their step
      const actions = steps.map((s) => s.before?.action).filter(Boolean)
      expect(actions).toContain('show-graph')
      expect(actions).toContain('open-force-place')
      expect(actions).toContain('multi-select-demo')
      expect(actions).toContain('open-scenarios')
    }
  })

  it('turns the graph overlay off again when leaving its step (after: hide-graph)', () => {
    for (const role of ['OF4', 'OF8'] as const) {
      const graphStep = stepsForRole(role).find(
        (s) => s.selector === '[data-testid="graph-overlay-toggle"]',
      )
      expect(graphStep?.before?.action).toBe('show-graph')
      expect(graphStep?.after?.action).toBe('hide-graph')
    }
  })

  it('scopes the draw-graph steps (add road / edit graph) to OF-4 only', () => {
    const of4 = stepsForRole('OF4').map((s) => s.selector)
    expect(of4).toContain('[data-testid="draw-road-toggle"]')
    expect(of4).toContain('[data-testid="edit-graph-toggle"]')
    const of8 = stepsForRole('OF8').map((s) => s.selector)
    expect(of8).not.toContain('[data-testid="draw-road-toggle"]')
    expect(of8).not.toContain('[data-testid="edit-graph-toggle"]')
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
