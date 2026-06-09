import { describe, expect, it } from 'vitest'
import type { RouteOption } from '../api/types'
import { keepSelectedMetric } from './routeSelection'

const opt = (metric: 'fast' | 'safe'): RouteOption =>
  ({
    label: metric === 'fast' ? 'fastest' : 'safest',
    metric,
    geometry: [],
    distance_m: 0,
    duration_s: 0,
    threat_max: 0,
    threat_avg: 0,
    fuel_consumed_l: 0,
    fuel_remaining_l: 0,
    sufficient_fuel: true,
  }) as RouteOption

const OPTS = [opt('fast'), opt('safe')]

describe('keepSelectedMetric', () => {
  it('keeps the prior choice when it is still offered (safest survives a mode switch)', () => {
    expect(keepSelectedMetric('safe', OPTS)).toBe('safe')
    expect(keepSelectedMetric('fast', OPTS)).toBe('fast')
  })

  it('defaults to the first option for a fresh plan (no prior choice)', () => {
    expect(keepSelectedMetric(null, OPTS)).toBe('fast')
  })

  it('falls back to the first option when the prior choice is no longer offered', () => {
    expect(keepSelectedMetric('safe', [opt('fast')])).toBe('fast')
  })

  it('returns null when there are no options', () => {
    expect(keepSelectedMetric('safe', [])).toBeNull()
  })
})
