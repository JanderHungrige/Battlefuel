// Pure helpers for the sim WebSocket: parse and reduce frames. Kept free of the
// WebSocket API so they are deterministically unit-testable.

import { cellToLatLng } from 'h3-js'
import type {
  BuyOrderUpdate,
  ChatterMessage,
  EnemyUnit,
  RefuelOrderUpdate,
  RendezvousReminder,
  StrategicMessage,
  TileUpdate,
  UnitUpdate,
} from '../api/types'
import { natoStageLabel } from '../lib/natoStage'
import { formatMgrs, precisionToAccuracy, toMgrs } from '../map/mgrsGrid'

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

/**
 * The MGRS "grid number" for a tile's cell centre, shown at `precisionM` location detail — e.g. a
 * pinpoint mine (100 m) reads `32U QV 074 558`, a broad sighting (2 km) reads `32U QV 07 55`.
 */
export function tileMgrs(h3Index: string, precisionM = 1000): string {
  const [lat, lon] = cellToLatLng(h3Index)
  return formatMgrs(toMgrs(lat, lon, precisionToAccuracy(precisionM)))
}

/**
 * Build a unified chatter line from a tile_update's stamped located event ("<MGRS> — <headline>",
 * expandable), or null when the tile carries none (a revert/decay just updates the map silently).
 * The MGRS is shown at the event's type-derived location detail (`precision_m`).
 */
export function tileEventChatter(u: TileUpdate, id: number): ChatterMessage | null {
  if (!u.last_event) return null
  const e = u.last_event
  const precision = e.precision_m ?? 1000
  return {
    id,
    kind: 'status',
    text: e.headline,
    mgrs: tileMgrs(u.h3_index, precision),
    sender: e.sender,
    category: e.category,
    estimated_threat: u.threat_level,
    supply_relevant: e.supply_relevant,
    h3_index: u.h3_index,
    game_s: e.at_game_s,
    precision_m: precision,
  }
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

/** Parse a raw WS frame into an EnemyUnit sighting, or null if not valid (unify-threat-chatter). */
export function parseEnemyUnit(raw: string): EnemyUnit | null {
  const msg = parse(raw)
  if (
    msg &&
    msg.type === 'enemy_unit' &&
    typeof msg.id === 'string' &&
    typeof msg.sidc === 'string' &&
    typeof msg.lat === 'number' &&
    typeof msg.lon === 'number'
  ) {
    return msg as unknown as EnemyUnit
  }
  return null
}

/** Parse an `enemy_unit_removed` frame → the removed sighting id, or null (its threat reverted). */
export function parseEnemyUnitRemoved(raw: string): string | null {
  const msg = parse(raw)
  if (msg && msg.type === 'enemy_unit_removed' && typeof msg.id === 'string') {
    return msg.id
  }
  return null
}

/** Latest enemy-unit sighting per id wins (dedup/update a contact). Returns a new map. */
export function applyEnemyUnit(
  state: Record<string, EnemyUnit>,
  unit: EnemyUnit,
): Record<string, EnemyUnit> {
  return { ...state, [unit.id]: unit }
}

/** Drop an enemy sighting by id (its threat event reverted/decayed). Returns a new map. */
export function removeEnemyUnit(
  state: Record<string, EnemyUnit>,
  id: string,
): Record<string, EnemyUnit> {
  if (!(id in state)) return state
  const next = { ...state }
  delete next[id]
  return next
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

/** Parse a raw WS frame into a RendezvousReminder, or null if not a valid rendezvous_reminder. */
export function parseRendezvousReminder(raw: string): RendezvousReminder | null {
  const msg = parse(raw)
  if (msg && msg.type === 'rendezvous_reminder' && typeof msg.order_id === 'string') {
    return msg as unknown as RendezvousReminder
  }
  return null
}

/** A short human-readable summary of a due rendezvous, for the strategic feed. */
export function describeRendezvousReminder(r: RendezvousReminder): string {
  return `Rendezvous due: tanker ${r.truck_id} ↔ unit ${r.unit_id} at ${r.sector_h3}. Confirm to launch.`
}

/** Latest frame per instance wins. Returns a new map (never mutates the input). */
export function applyUnitUpdate(
  state: Record<string, UnitUpdate>,
  update: UnitUpdate,
): Record<string, UnitUpdate> {
  return { ...state, [update.instance_id]: update }
}
