import { describe, expect, it } from 'vitest'
import type { DepotFuel, FuelStock } from '../api/types'
import { depotGauges, depotIconKey, filledSegments } from './depotSymbol'

const stock = (fuel_type: string, q: number, c: number): FuelStock => ({
  depot_id: 'd1',
  fuel_type,
  quantity_liters: q,
  capacity_liters: c,
})

describe('filledSegments', () => {
  it('maps fill fraction to 0–4 segments (rounded)', () => {
    expect(filledSegments(0, 10000)).toBe(0)
    expect(filledSegments(1250, 10000)).toBe(1) // 12.5% → round(0.5) = 1 (round-half-up)
    expect(filledSegments(5000, 10000)).toBe(2) // 50%
    expect(filledSegments(10000, 10000)).toBe(4) // full
  })

  it('guards divide-by-zero and clamps over-full to 4', () => {
    expect(filledSegments(100, 0)).toBe(0)
    expect(filledSegments(20000, 10000)).toBe(4)
  })
})

describe('depotGauges', () => {
  it('computes per-fuel segments, summing multiple stocks of the same type', () => {
    const g = depotGauges([
      stock('diesel', 2500, 10000),
      stock('jp8', 9000, 10000),
    ])
    expect(g).toEqual({ diesel: 1, jp8: 4 })
  })

  it('matches fuel type case-insensitively and yields 0 for a missing type', () => {
    expect(depotGauges([stock('DIESEL', 10000, 10000)])).toEqual({ diesel: 4, jp8: 0 })
  })
})

describe('depotIconKey', () => {
  it('encodes the gauge fill so equal-fill depots share an image key', () => {
    const d = (stocks: FuelStock[]): DepotFuel => ({
      depot: { id: 'x', name: 'X', h3_index: 'h', lat: 0, lon: 0 },
      stocks,
    })
    expect(depotIconKey(d([stock('diesel', 5000, 10000), stock('jp8', 0, 10000)]))).toBe(
      'depot:2-0',
    )
    // Same fill, different depot identity → same key (image reuse).
    expect(depotIconKey(d([stock('diesel', 5000, 10000), stock('jp8', 100, 10000)]))).toBe(
      'depot:2-0',
    )
  })
})
