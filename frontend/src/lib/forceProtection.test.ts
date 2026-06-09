import { describe, expect, it } from 'vitest'
import { FORCE_PROTECTION_THREAT, needsForceProtection } from './forceProtection'

describe('needsForceProtection', () => {
  it('triggers at/above the threat-sector threshold', () => {
    expect(needsForceProtection(FORCE_PROTECTION_THREAT)).toBe(true)
    expect(needsForceProtection(5)).toBe(true)
  })

  it('does not trigger below the threshold or for missing values', () => {
    expect(needsForceProtection(FORCE_PROTECTION_THREAT - 1)).toBe(false)
    expect(needsForceProtection(0)).toBe(false)
    expect(needsForceProtection(null)).toBe(false)
    expect(needsForceProtection(undefined)).toBe(false)
  })
})
