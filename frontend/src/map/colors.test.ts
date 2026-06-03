import { describe, expect, it } from 'vitest'
import { ACCENT, ROUTE, SELECTED_UNIT, SELECTED_UNIT_RING } from './colors'

describe('map colors', () => {
  it('accent is the v2 warm tone, not the old cyan', () => {
    expect(ACCENT).toBe('#FFD9BD')
    expect(ACCENT).not.toBe('#00e5cc')
  })

  it('route visuals match the friendly NATO symbol fill', () => {
    expect(ROUTE).toBe('#80e0ff')
  })

  it('selected-unit highlight is bright yellow with a darker ring', () => {
    expect(SELECTED_UNIT).toBe('#ffe600')
    expect(SELECTED_UNIT_RING).toBe('#8a6d00')
  })
})
