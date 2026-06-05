// Pure helpers for the sim WebSocket: parse and reduce frames. Kept free of the
// WebSocket API so they are deterministically unit-testable.

import type {
  BuyOrderUpdate,
  CombatEvent,
  RefuelOrderUpdate,
  StrategicMessage,
  TileUpdate,
  UnitUpdate,
} from '../api/types'
import { natoStageLabel } from '../lib/natoStage'
import { formatMgrs, toMgrs } from '../map/mgrsGrid'

function parse(raw: string): Record<string, unknown> | null {
  try {
    const msg: unknown = JSON.parse(raw)
    return typeof msg === 'object' && msg !== null ? (msg as Record<string, unknown>) : null
  } catch {
    console.warn('[simSocket] dropping malformed WS frame')
    return null
  }
}

/** Parse a raw WS frame into a UnitUpdate, or null if it is not a valid unit_update. */
export function parseUnitUpdate(raw: string): UnitUpdate | null {
  const msg = parse(raw)
  if (msg && msg.type === 'unit_update' && typeof msg.instance_id === 'string') {
    return msg as unknown as UnitUpdate
  }
  return null
}

/** Parse a raw WS frame into a TileUpdate, or null if it is not a valid tile_update. */
export function parseTileUpdate(raw: string): TileUpdate | null {
  const msg = parse(raw)
  if (msg && msg.type === 'tile_update' && typeof msg.h3_index === 'string') {
    return msg as unknown as TileUpdate
  }
  return null
}

/** Latest tile frame per h3_index wins. Returns a new map (never mutates the input). */
export function applyTileUpdate(
  state: Record<string, TileUpdate>,
  update: TileUpdate,
): Record<string, TileUpdate> {
  return { ...state, [update.h3_index]: update }
}

/** A short human-readable summary of a tile_update, for the chatter log. */
export function describeTileUpdate(u: TileUpdate): string {
  const parts = [`threat ${u.threat_level}/5`, `road ${u.road_condition}`]
  if (u.situation) parts.push(u.situation.replace(/_/g, ' '))
  if (u.note) parts.push(`“${u.note}”`)
  return parts.join(' · ')
}

/** Parse a raw WS frame into a BuyOrderUpdate, or null if it is not a valid buy_order_update. */
export function parseBuyOrderUpdate(raw: string): BuyOrderUpdate | null {
  const msg = parse(raw)
  if (msg && msg.type === 'buy_order_update' && typeof msg.order_id === 'string') {
    return msg as unknown as BuyOrderUpdate
  }
  return null
}

/** Parse a raw WS frame into a RefuelOrderUpdate, or null if not a valid refuel_order_update. */
export function parseRefuelOrderUpdate(raw: string): RefuelOrderUpdate | null {
  const msg = parse(raw)
  if (msg && msg.type === 'refuel_order_update' && typeof msg.order_id === 'string') {
    return msg as unknown as RefuelOrderUpdate
  }
  return null
}

/** Parse a raw WS frame into a CombatEvent, or null if it is not a valid combat_event. */
export function parseCombatEvent(raw: string): CombatEvent | null {
  const msg = parse(raw)
  if (
    msg &&
    msg.type === 'combat_event' &&
    typeof msg.id === 'string' &&
    typeof msg.lat === 'number' &&
    typeof msg.lon === 'number'
  ) {
    return msg as unknown as CombatEvent
  }
  return null
}

/** Formatted MGRS coordinate (to 1 m) for a combat event's location — the chatter tag. */
export function combatEventMgrs(ev: CombatEvent): string {
  return formatMgrs(toMgrs(ev.lat, ev.lon))
}

/** Latest combat-event frame per id wins. Returns a new map (never mutates the input). */
export function applyCombatEvent(
  state: Record<string, CombatEvent>,
  event: CombatEvent,
): Record<string, CombatEvent> {
  return { ...state, [event.id]: event }
}

/** Parse a raw WS frame into a StrategicMessage, or null if not a valid strategic_message. */
export function parseStrategicMessage(raw: string): StrategicMessage | null {
  const msg = parse(raw)
  if (msg && msg.type === 'strategic_message' && typeof msg.text === 'string') {
    return msg as unknown as StrategicMessage
  }
  return null
}

/** A short human-readable summary of a buy-order stage change / delivery, for the chatter feed. */
export function describeBuyOrderUpdate(u: BuyOrderUpdate): string {
  const dest = u.depot_id
  const amount = `${Math.round(u.quantity_liters)} L ${u.fuel_type}`
  if (u.status === 'delivered' || u.nato_stage === 'reached_opcon') {
    return `Fuel order reached OPCON: ${amount} → ${dest}`
  }
  return `Fuel order ${natoStageLabel(u.nato_stage)}: ${amount} → ${dest}`
}

/** A short human-readable summary of a completed refuel, for the chatter/strategic feed. */
export function describeRefuelOrderUpdate(u: RefuelOrderUpdate): string {
  return `Refuel complete: ${Math.round(u.transferred_liters)} L ${u.fuel_type} → ${u.unit_id}`
}

/** Latest frame per instance wins. Returns a new map (never mutates the input). */
export function applyUnitUpdate(
  state: Record<string, UnitUpdate>,
  update: UnitUpdate,
): Record<string, UnitUpdate> {
  return { ...state, [update.instance_id]: update }
}
