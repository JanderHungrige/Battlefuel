import { describe, expect, it } from 'vitest'
import { ALL_EVENT_ICONS, iconForEvent } from './eventIcons'

describe('iconForEvent', () => {
  it('maps mine/IED to the mine glyph (before any generic threat rule)', () => {
    expect(iconForEvent('Threat Events', 'IED / mine detected or detonated').key).toBe('evt:mine')
    expect(iconForEvent('Movement & Access', 'Minefield confirmed on MSR').key).toBe('evt:mine')
  })

  it('maps air/drone threats to the drone glyph', () => {
    expect(iconForEvent('Threat Events', 'Air threat detected (drone/fixed-wing/helo)').key).toBe(
      'evt:drone',
    )
  })

  it('maps hostile/spotted to the enemy-near glyph', () => {
    expect(iconForEvent('Threat Events', 'Hostile unit spotted / identified').key).toBe('evt:enemy')
  })

  it('maps movement/chokepoint to the checkpoint glyph', () => {
    expect(iconForEvent('Movement & Access', 'Chokepoint / bottleneck identified').key).toBe(
      'evt:checkpoint',
    )
  })

  it('maps strikes/engagements to the fires glyph', () => {
    expect(iconForEvent('Engagements & Fires', 'Air strike delivered').key).toBe('evt:fires')
  })

  it('falls back to the generic glyph for unmatched events', () => {
    expect(iconForEvent('Logistics & Support', 'Resupply convoy departed / arrived').key).toBe(
      'evt:generic',
    )
  })

  it("does not false-match 'ied' inside words like identified (word-boundary)", () => {
    // "identified" must NOT be a mine; it should be enemy-near here.
    expect(iconForEvent('Threat Events', 'Hostile unit spotted / identified').key).not.toBe(
      'evt:mine',
    )
  })

  it('every returned icon is in ALL_EVENT_ICONS with a single-char glyph', () => {
    const keys = new Set(ALL_EVENT_ICONS.map((i) => i.key))
    expect(keys.has(iconForEvent('x', 'y').key)).toBe(true)
    for (const ic of ALL_EVENT_ICONS) expect(ic.glyph).toHaveLength(1)
  })
})
