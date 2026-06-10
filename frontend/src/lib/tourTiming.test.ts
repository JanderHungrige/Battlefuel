import { describe, expect, it } from 'vitest'
import { TOUR_MAX_MS, TOUR_MIN_MS, autoAdvanceDelayMs, wordCount } from './tourTiming'

describe('wordCount', () => {
  it('counts whitespace-separated words and is empty-safe', () => {
    expect(wordCount('')).toBe(0)
    expect(wordCount('   ')).toBe(0)
    expect(wordCount('one')).toBe(1)
    expect(wordCount('  many   spaced   words here ')).toBe(4)
  })
})

describe('autoAdvanceDelayMs', () => {
  it('holds the floor for short captions', () => {
    // 0–6 words land below the 4s floor and are clamped up.
    expect(autoAdvanceDelayMs('')).toBe(TOUR_MIN_MS)
    expect(autoAdvanceDelayMs('short caption six words long here')).toBe(TOUR_MIN_MS)
  })

  it('caps long captions at the maximum', () => {
    const long = Array.from({ length: 40 }, () => 'word').join(' ')
    expect(autoAdvanceDelayMs(long)).toBe(TOUR_MAX_MS)
  })

  it('scales between floor and cap with length, staying in range', () => {
    const mid = autoAdvanceDelayMs(Array.from({ length: 8 }, () => 'word').join(' '))
    expect(mid).toBeGreaterThan(TOUR_MIN_MS)
    expect(mid).toBeLessThan(TOUR_MAX_MS)
    // monotonic: more words → not shorter
    const fewer = autoAdvanceDelayMs(Array.from({ length: 7 }, () => 'word').join(' '))
    expect(mid).toBeGreaterThanOrEqual(fewer)
  })

  it('never returns a value outside the clamp window', () => {
    for (const n of [0, 1, 5, 10, 15, 20, 25, 50, 200]) {
      const d = autoAdvanceDelayMs(Array.from({ length: n }, () => 'w').join(' '))
      expect(d).toBeGreaterThanOrEqual(TOUR_MIN_MS)
      expect(d).toBeLessThanOrEqual(TOUR_MAX_MS)
    }
  })
})
