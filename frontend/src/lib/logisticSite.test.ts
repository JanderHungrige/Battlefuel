import { describe, expect, it } from 'vitest'
import {
  LOGISTIC_SITE_TYPES,
  logisticSiteLabel,
  logisticSiteShort,
} from './logisticSite'

describe('logisticSite', () => {
  it('lists the five AJP-4.6 JLSG site types', () => {
    expect(LOGISTIC_SITE_TYPES).toEqual(['bsa', 'cssbn', 'dob', 'fls', 'tlb'])
  })

  it('labels each type with its full name', () => {
    expect(logisticSiteLabel('bsa')).toBe('Brigade Support Area (BSA)')
    expect(logisticSiteLabel('tlb')).toBe('Theatre Logistic Base (TLB)')
  })

  it('labels a plain depot (no type) as "Depot"', () => {
    expect(logisticSiteLabel(null)).toBe('Depot')
    expect(logisticSiteLabel(undefined)).toBe('Depot')
  })

  it('renders a short tag', () => {
    expect(logisticSiteShort('fls')).toBe('FLS')
    expect(logisticSiteShort(null)).toBe('DEPOT')
  })
})
