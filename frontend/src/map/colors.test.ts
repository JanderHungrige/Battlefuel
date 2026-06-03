import { describe, expect, it } from 'vitest'
import { ACCENT, SELECTED_UNIT, SELECTED_UNIT_RING } from './colors'

describe('map colors', () => {
  it('accent is the v2 warm tone, not the old cyan', () => {
    expect(ACCENT).toBe('#FFD9BD')
    expect(ACCENT).not.toBe('#00e5cc')
  })

  it('selected-unit highlight is a darker blue with a darker ring', () => {
    expect(SELECTED_UNIT).toBe('#1d4ed8')
    expect(SELECTED_UNIT_RING).toBe('#1e3a8a')
  })
})
