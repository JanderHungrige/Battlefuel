import { describe, expect, it } from 'vitest'
import type { ChatterMessage, CombatEvent } from '../api/types'
import {
  DEFAULT_CHATTER_FILTERS,
  chatterVisible,
  combatEventVisible,
  filterChatter,
  filterCombatEvents,
  isCombatLine,
  type ChatterFilters,
} from './chatterFilter'

function combatLine(over: Partial<ChatterMessage> = {}): ChatterMessage {
  return {
    id: 1,
    kind: 'status',
    text: 'Hostile spotted',
    event_id: 'ev-1',
    estimated_threat: 3,
    supply_relevant: false,
    ...over,
  }
}

const sectorLine: ChatterMessage = {
  id: 2,
  kind: 'status',
  text: 'Sector: threat 1/5 · road clear',
  h3_index: 'h1',
}

function filters(over: Partial<ChatterFilters> = {}): ChatterFilters {
  return { ...DEFAULT_CHATTER_FILTERS, ...over }
}

describe('isCombatLine', () => {
  it('is true only when event id and estimated threat are present', () => {
    expect(isCombatLine(combatLine())).toBe(true)
    expect(isCombatLine(sectorLine)).toBe(false)
    expect(isCombatLine(combatLine({ estimated_threat: undefined }))).toBe(false)
  })
})

describe('chatterVisible — mode all', () => {
  it('always shows sector lines and respects the threshold for combat lines', () => {
    expect(chatterVisible(sectorLine, filters({ mode: 'all', minThreat: 5 }))).toBe(true)
    expect(chatterVisible(combatLine({ estimated_threat: 2 }), filters({ minThreat: 3 }))).toBe(false)
    expect(chatterVisible(combatLine({ estimated_threat: 4 }), filters({ minThreat: 3 }))).toBe(true)
  })

  it('treats the threshold as inclusive', () => {
    expect(chatterVisible(combatLine({ estimated_threat: 3 }), filters({ minThreat: 3 }))).toBe(true)
  })
})

describe('chatterVisible — mode threat', () => {
  it('hides sector lines and keeps only combat lines at/above the threshold', () => {
    const f = filters({ mode: 'threat', minThreat: 3 })
    expect(chatterVisible(sectorLine, f)).toBe(false)
    expect(chatterVisible(combatLine({ estimated_threat: 2 }), f)).toBe(false)
    expect(chatterVisible(combatLine({ estimated_threat: 3 }), f)).toBe(true)
  })
})

describe('chatterVisible — mode supply', () => {
  it('shows only supply-relevant combat lines regardless of threat threshold', () => {
    const f = filters({ mode: 'supply', minThreat: 5 })
    expect(chatterVisible(sectorLine, f)).toBe(false)
    expect(chatterVisible(combatLine({ supply_relevant: false }), f)).toBe(false)
    expect(
      chatterVisible(combatLine({ supply_relevant: true, estimated_threat: 1 }), f),
    ).toBe(true)
  })
})

function event(over: Partial<CombatEvent> = {}): CombatEvent {
  return {
    type: 'combat_event',
    id: 'ev-1',
    category: 'Threat Events',
    event: 'Hostile spotted',
    lat: 49.2,
    lon: 11.85,
    precision_m: 2000,
    estimated_threat: 3,
    sender: 'RECON',
    zone: 'threat',
    game_s: 120,
    ...over,
  }
}

describe('combatEventVisible', () => {
  it('hides a square whose zone toggle is off', () => {
    const f = filters({ zones: { combat: true, blocked: true, threat: false } })
    expect(combatEventVisible(event({ zone: 'threat' }), f)).toBe(false)
    expect(combatEventVisible(event({ zone: 'combat' }), f)).toBe(true)
  })

  it('hides a square below the threat threshold', () => {
    const f = filters({ minThreat: 4 })
    expect(combatEventVisible(event({ estimated_threat: 3 }), f)).toBe(false)
    expect(combatEventVisible(event({ estimated_threat: 4 }), f)).toBe(true)
  })
})

describe('filter wrappers', () => {
  it('filterChatter and filterCombatEvents apply the predicates', () => {
    const msgs = [sectorLine, combatLine({ id: 3, estimated_threat: 1 })]
    expect(filterChatter(msgs, filters({ mode: 'threat', minThreat: 2 }))).toHaveLength(0)

    const evs = [event({ zone: 'combat' }), event({ id: 'ev-2', zone: 'blocked' })]
    const f = filters({ zones: { combat: false, blocked: true, threat: true } })
    expect(filterCombatEvents(evs, f).map((e) => e.id)).toEqual(['ev-2'])
  })
})
