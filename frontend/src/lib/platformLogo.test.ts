import { describe, expect, it } from 'vitest'
import { platformLogoSrc } from './platformLogo'

describe('platformLogoSrc', () => {
  it('maps a known platform logo_key to its committed asset', () => {
    expect(platformLogoSrc('world-fuel')).toBe('/logos/World-Fuel-Services-Logo.png')
    expect(platformLogoSrc('shell-fm')).toBe('/logos/shell-logo-png-transparent.png')
  })

  it('returns null for an unknown key (falls back to a badge)', () => {
    expect(platformLogoSrc('acme-fuel')).toBeNull()
  })

  it('returns null for null / empty', () => {
    expect(platformLogoSrc(null)).toBeNull()
    expect(platformLogoSrc('')).toBeNull()
    expect(platformLogoSrc(undefined)).toBeNull()
  })
})
