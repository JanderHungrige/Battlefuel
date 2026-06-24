import { describe, expect, it } from 'vitest'
import type { ChatterMessage } from '../api/types'
import {
  DEFAULT_CHATTER_FILTERS,
  chatterVisible,
  filterChatter,
  isCombatLine,
  type ChatterFilters,
} from './chatterFilter'

function eventLine(over: Partial<ChatterMessage> = {}): ChatterMessage {
  return {
    id: 1,
    kind: 'status',
    text: 'Hostile spotted',
    h3_index: '8811aa',
    estimated_threat: 4,
    supply_relevant: false,
    ...over,
  }
}

const plainLine: ChatterMessage = { id: 2, kind: 'order', text: 'Refuel complete → unit-1' }

function filters(over: Partial<ChatterFilters> = {}): ChatterFilters {
  return { ...DEFAULT_CHATTER_FILTERS, ...over }
}

describe('defaults', () => {
  it('defaults the threshold to 3', () => {
    expect(DEFAULT_CHATTER_FILTERS.minThreat).toBe(3)
  })
})

describe('isCombatLine', () => {
  it('is true for a line with a sector/event id and an estimated threat', () => {
    expect(isCombatLine(eventLine())).toBe(true)
    expect(isCombatLine(plainLine)).toBe(false)
    expect(isCombatLine(eventLine({ estimated_threat: undefined }))).toBe(false)
  })
})

describe('chatterVisible — mode all', () => {
  it('always shows plain lines and applies the threshold to event lines', () => {
    expect(chatterVisible(plainLine, filters({ mode: 'all', minThreat: 5 }))).toBe(true)
    expect(chatterVisible(eventLine({ estimated_threat: 2 }), filters({ minThreat: 3 }))).toBe(false)
    expect(chatterVisible(eventLine({ estimated_threat: 3 }), filters({ minThreat: 3 }))).toBe(true)
  })
})

describe('chatterVisible — mode threat', () => {
  it('keeps only event lines at/above the threshold', () => {
    const f = filters({ mode: 'threat', minThreat: 3 })
    expect(chatterVisible(plainLine, f)).toBe(false)
    expect(chatterVisible(eventLine({ estimated_threat: 2 }), f)).toBe(false)
    expect(chatterVisible(eventLine({ estimated_threat: 4 }), f)).toBe(true)
  })
})

describe('chatterVisible — mode supply', () => {
  it('shows only supply-relevant event lines regardless of threshold', () => {
    const f = filters({ mode: 'supply', minThreat: 5 })
    expect(chatterVisible(plainLine, f)).toBe(false)
    expect(chatterVisible(eventLine({ supply_relevant: false }), f)).toBe(false)
    expect(chatterVisible(eventLine({ supply_relevant: true, estimated_threat: 1 }), f)).toBe(true)
  })
})

describe('filterChatter', () => {
  it('applies the predicate', () => {
    const msgs = [plainLine, eventLine({ id: 3, estimated_threat: 1 })]
    expect(filterChatter(msgs, filters({ mode: 'threat', minThreat: 2 }))).toHaveLength(0)
    expect(filterChatter(msgs, filters({ mode: 'all', minThreat: 0 }))).toHaveLength(2)
  })
})
