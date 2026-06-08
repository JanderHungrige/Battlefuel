import { describe, expect, it } from 'vitest'
import {
  FUEL_AMBER,
  FUEL_GREEN,
  FUEL_RED,
  fuelBarBucket,
  fuelBarColor,
  fuelBarKey,
  fuelFraction,
} from './unitFuelBar'

describe('fuelFraction', () => {
  it('returns the clamped ratio', () => {
    expect(fuelFraction(5000, 10000)).toBe(0.5)
    expect(fuelFraction(15000, 10000)).toBe(1)
    expect(fuelFraction(-100, 10000)).toBe(0)
  })

  it('returns null with no telemetry or no capacity', () => {
    expect(fuelFraction(null, 10000)).toBeNull()
    expect(fuelFraction(undefined, 10000)).toBeNull()
    expect(fuelFraction(5000, 0)).toBeNull()
  })
})

describe('fuelBarColor', () => {
  it('is green above half, amber in the middle, red when low', () => {
    expect(fuelBarColor(0.8)).toBe(FUEL_GREEN)
    expect(fuelBarColor(0.4)).toBe(FUEL_AMBER)
    expect(fuelBarColor(0.1)).toBe(FUEL_RED)
  })
})

describe('fuelBarBucket / fuelBarKey', () => {
  it('quantises to bounded buckets', () => {
    expect(fuelBarBucket(0)).toBe(0)
    expect(fuelBarBucket(1)).toBe(10)
    expect(fuelBarBucket(0.54)).toBe(5)
  })

  it('keys by bucket', () => {
    expect(fuelBarKey(0.5)).toBe('ufb:5')
    expect(fuelBarKey(1)).toBe('ufb:10')
  })
})
