// Pure filter model for the unified chatter feed (Wave 4 F4 → unify-threat-chatter). Mode +
// threshold over the tile-event chatter lines; reads the event's threat + supply-relevance.

import type { ChatterMessage } from '../api/types'

export type ChatterMode = 'all' | 'threat' | 'supply'

export interface ChatterFilters {
  mode: ChatterMode
  /** Minimum estimated threat (0..5) an event line must meet to show. */
  minThreat: number
}

export const DEFAULT_CHATTER_FILTERS: ChatterFilters = {
  mode: 'all',
  minThreat: 3,
}

/** A chatter line is an "event line" when it carries a sector/event id and an estimated threat. */
export function isCombatLine(m: ChatterMessage): boolean {
  return (m.h3_index != null || m.event_id != null) && m.estimated_threat != null
}

/** Whether a chatter line passes the current filter. */
export function chatterVisible(m: ChatterMessage, f: ChatterFilters): boolean {
  const combat = isCombatLine(m)
  if (f.mode === 'supply') return combat && Boolean(m.supply_relevant)
  if (f.mode === 'threat') return combat && (m.estimated_threat ?? 0) >= f.minThreat
  // 'all': non-event lines always show; event lines respect the threshold.
  if (combat) return (m.estimated_threat ?? 0) >= f.minThreat
  return true
}

export function filterChatter(messages: ChatterMessage[], f: ChatterFilters): ChatterMessage[] {
  return messages.filter((m) => chatterVisible(m, f))
}
