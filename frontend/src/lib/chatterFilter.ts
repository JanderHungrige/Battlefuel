// Pure filter model for the chatter feed + combat-event map squares (v2 Wave 4 F4).
// Both the radio list and the map highlight reuse the backend's central classification
// (the `zone` + `estimated_threat` already carried on each combat_event), so there is no
// second frontend interpretation of what is "threat" vs "blocked" vs "combat".

import type { ChatterMessage, CombatEvent, CombatEventZone } from '../api/types'

export type ChatterMode = 'all' | 'threat' | 'supply'

export interface ChatterFilters {
  mode: ChatterMode
  /** Minimum estimated threat (0..5) a combat line/square must meet to show. */
  minThreat: number
  /** Which combat-event zones render as map squares. */
  zones: Record<CombatEventZone, boolean>
}

export const DEFAULT_CHATTER_FILTERS: ChatterFilters = {
  mode: 'all',
  minThreat: 0,
  zones: { combat: true, blocked: true, threat: true },
}

/** A chatter line is a "combat line" when it carries an event id and an estimated threat. */
export function isCombatLine(m: ChatterMessage): boolean {
  return m.event_id != null && m.estimated_threat != null
}

/** Whether a chatter line passes the current filter (see doc 95 business rules). */
export function chatterVisible(m: ChatterMessage, f: ChatterFilters): boolean {
  const combat = isCombatLine(m)
  if (f.mode === 'supply') return combat && Boolean(m.supply_relevant)
  if (f.mode === 'threat') return combat && (m.estimated_threat ?? 0) >= f.minThreat
  // 'all': sector/strategic lines always show; combat lines respect the threshold.
  if (combat) return (m.estimated_threat ?? 0) >= f.minThreat
  return true
}

/** Whether a combat-event map square passes the current filter (zone toggle + threshold). */
export function combatEventVisible(ev: CombatEvent, f: ChatterFilters): boolean {
  if (!f.zones[ev.zone]) return false
  return ev.estimated_threat >= f.minThreat
}

export function filterChatter(messages: ChatterMessage[], f: ChatterFilters): ChatterMessage[] {
  return messages.filter((m) => chatterVisible(m, f))
}

export function filterCombatEvents(events: CombatEvent[], f: ChatterFilters): CombatEvent[] {
  return events.filter((ev) => combatEventVisible(ev, f))
}
