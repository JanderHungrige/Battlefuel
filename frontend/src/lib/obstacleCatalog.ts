// Maps a combat-event catalog item to an obstacle/sector-condition template, and filters the
// catalog for the searchable obstacle picker (v2 Wave 4 F7). Pure + deterministic, mirroring the
// Wave-3 classify spirit so the picker's prefill matches how threats render elsewhere.

import type { CombatEventCatalogItem, TileMutationRequest } from '../api/types'
import type { ObstacleKind } from '../components/obstacleKinds'

export interface ObstacleTemplate {
  /** Source catalog id (so the picker can mark the active selection). */
  id: string
  kind: ObstacleKind
  /** Human label (the event text) — used as the placed obstacle's note. */
  label: string
  /** Tile defaults the placement applies to the containing cell (operator can still override). */
  mutation: TileMutationRequest
}

/** Default template before the operator picks one (keeps the tool usable pre-selection). */
export const DEFAULT_OBSTACLE_TEMPLATE: ObstacleTemplate = {
  id: '',
  kind: 'minefield',
  label: 'Manual obstacle',
  mutation: { road_condition: 'blocked' },
}

export function catalogToObstacleTemplate(item: CombatEventCatalogItem): ObstacleTemplate {
  const e = item.event.toLowerCase()
  const base = { id: item.id, label: item.event, threat: item.threat_level }

  let kind: ObstacleKind
  let mutation: TileMutationRequest

  if (/\b(ied|mine|minefield)\b/.test(e)) {
    kind = 'minefield'
    mutation = { road_condition: 'blocked' }
  } else if (e.includes('destroyed') || e.includes('crater') || e.includes('bridge')) {
    kind = 'crater'
    mutation = { road_condition: 'blocked' }
  } else if (
    e.includes('chokepoint') ||
    e.includes('bottleneck') ||
    e.includes('severed') ||
    e.includes('degraded') ||
    e.includes('damaged')
  ) {
    kind = 'roadblock'
    mutation = { road_condition: 'damaged' }
  } else if (
    e.includes('checkpoint') ||
    e.includes('border') ||
    e.includes('curfew') ||
    e.includes('civilian')
  ) {
    kind = e.includes('civilian') ? 'barricade' : 'checkpoint'
    mutation = {}
  } else {
    kind = item.threat_level >= 4 ? 'roadblock' : 'checkpoint'
    mutation = {}
  }

  return {
    id: base.id,
    kind,
    label: base.label,
    mutation: { ...mutation, threat_level: base.threat, note: item.event },
  }
}

/** Case-insensitive search over category + event text. Empty query returns all items. */
export function filterCatalog(
  items: CombatEventCatalogItem[],
  query: string,
): CombatEventCatalogItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter(
    (i) => i.category.toLowerCase().includes(q) || i.event.toLowerCase().includes(q),
  )
}
