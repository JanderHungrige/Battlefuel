import { describe, expect, it } from 'vitest'
import { TOUR_STEP_MS, autoAdvanceDelayMs, wordCount } from './tourTiming'

describe('wordCount', () => {
  it('counts whitespace-separated words and is empty-safe', () => {
    expect(wordCount('')).toBe(0)
    expect(wordCount('   ')).toBe(0)
    expect(wordCount('one')).toBe(1)
    expect(wordCount('  many   spaced   words here ')).toBe(4)
  })
})

describe('autoAdvanceDelayMs', () => {
  it('is a fixed 3 seconds', () => {
    expect(TOUR_STEP_MS).toBe(3_000)
    expect(autoAdvanceDelayMs('')).toBe(3_000)
    expect(autoAdvanceDelayMs('a short caption')).toBe(3_000)
  })

  it('ignores caption length — every step dwells the same', () => {
    const short = autoAdvanceDelayMs('one two')
    const long = autoAdvanceDelayMs(Array.from({ length: 60 }, () => 'word').join(' '))
    expect(short).toBe(long)
    expect(long).toBe(TOUR_STEP_MS)
  })
})
