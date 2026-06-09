// TypeScript mirrors of the backend API schemas (the contract between the two).

import type { NatoStage } from '../lib/natoStage'

export interface BBox {
  west: number
  south: number
  east: number
  north: number
}

export interface Theater {
  id: string
  name: string
  bbox: BBox
  center_lon: number
  center_lat: number
  default_zoom: number
}

export type TerrainType =
  | 'open'
  | 'forest'
  | 'urban'
  | 'water'
  | 'farmland'
  | 'wetland'
  | 'military'
  | 'unknown'

export interface Tile {
  h3_index: string
  resolution: number
  center_lat: number
  center_lon: number
  terrain: TerrainType
  threat_level: number
  intel_level: 'none' | 'low' | 'medium' | 'high'
  weather: 'clear' | 'rain' | 'fog' | 'snow' | 'storm'
  road_condition: 'clear' | 'damaged' | 'blocked'
  cover: 'none' | 'light' | 'heavy'
  situation?: SectorSituation | null
  note?: string | null
  boundary: number[][] // ring of [lon, lat]
}

export type SectorSituation =
  | 'quiet'
  | 'enemy_contact'
  | 'under_fire'
  | 'combat'
  | 'secured'
  | 'supply_point'
  | 'medevac'

/** One line in the side "radio" chatter log. */
export interface ChatterMessage {
  id: number
  kind: 'status' | 'order'
  text: string
  h3_index?: string
  /** Combat-event tagging (v2 Wave 3): MGRS coord + sender, and click-to-locate target. */
  mgrs?: string
  sender?: string
  event_id?: string
  lat?: number
  lon?: number
}

export type InstanceStatus =
  | 'operational'
  | 'degraded'
  | 'non_operational'
  | 'unknown'

export interface UnitInstance {
  id: string
  name: string
  unit_type_id: string
  lat: number
  lon: number
  h3_index: string
  status: InstanceStatus
  current_fuel_liters: number | null
}

/** A placed enemy unit, rendered as a red APP-6 hostile symbol (v2 Wave 3). Render-only. */
export interface EnemyUnit {
  id: string
  name: string
  sidc: string
  lat: number
  lon: number
  echelon: string | null
}

export interface FuelProfile {
  fuel_type: string
  capacity_liters: number
  consumption_normal_lph: number
  consumption_combat_lph: number
  consumption_idle_lph: number
}

export interface UnitType {
  id: string
  name: string
  nato_unit_type: string
  echelon: string
  sidc: string
  recon_level: string
  fuel: FuelProfile
  endurance_hours_normal: number | null
  endurance_hours_combat: number | null
  description: string | null
}

// --- Routing & movement (Wave 3) ---

/** Which cost the route was optimised for. */
export type RouteMetric = 'fast' | 'safe'

/** Travel mode — how the unit moves (v2 Wave 10). road = pgRouting; offroad = terrain A*;
 *  hybrid = better of road/off-road; direct = near-straight cross-country line. */
export type RouteMode = 'road' | 'offroad' | 'hybrid' | 'direct'

export type MoveOrderStatus =
  | 'pending'
  | 'active'
  | 'complete'
  | 'cancelled'
  | 'halted' // stopped at an obstruction; awaiting operator (Wave 10 F1)
  | 'crossing' // operator chose "proceed slowly": crawling across the obstruction (Wave 10 F1)

/** One planning option returned by POST /routes/plan. geometry is [lon, lat] pairs. */
export interface RouteOption {
  label: 'fastest' | 'safest'
  metric: RouteMetric
  geometry: number[][]
  distance_m: number
  duration_s: number
  threat_max: number
  threat_avg: number
  fuel_consumed_l: number
  fuel_remaining_l: number
  sufficient_fuel: boolean
}

export interface PlanRouteRequest {
  instance_id: string
  dest_lat: number
  dest_lon: number
  mode?: RouteMode // default 'road' on the backend (v2 Wave 10)
}

/** A persisted, server-authoritative move order. geometry is [lon, lat] pairs. */
export interface MoveOrder {
  id: string
  instance_id: string
  status: MoveOrderStatus
  metric: RouteMetric
  distance_m: number
  duration_s: number
  fuel_consumed_l: number
  progress_m: number
  geometry: number[][]
}

export interface CreateMoveOrderRequest {
  instance_id: string
  dest_lat: number
  dest_lon: number
  metric: RouteMetric
  mode?: RouteMode // default 'road' on the backend (v2 Wave 10)
}

/** An operator-placed waypoint (v2 Wave 10 F5). */
export interface WaypointInput {
  lat: number
  lon: number
  mode?: RouteMode // per-leg travel mode (v2 W16 F3); falls back to the request mode
}

export interface PlanWaypointsRequest {
  instance_id: string
  waypoints: WaypointInput[]
  mode?: RouteMode
}

export interface CreateWaypointMoveOrderRequest {
  instance_id: string
  waypoints: WaypointInput[]
  metric: RouteMetric
  mode?: RouteMode
}

/** A live per-unit frame broadcast by the sim engine over the WebSocket (server→client). */
export interface UnitUpdate {
  type: 'unit_update'
  instance_id: string
  order_id: string
  lat: number
  lon: number
  fuel_l: number
  status: MoveOrderStatus
  progress_m: number
  distance_m: number
  reason?: 'blocked' | 'threat' // why the unit halted, set when status === 'halted' (Wave 10 F1)
}

/** Operator-placed fuel depot request (v2 Wave 10 F6). */
export interface CreateDepotRequest {
  name: string
  lat: number
  lon: number
  // NATO JLSG site type (v2 Wave 11 F5); omit for a plain depot/marker.
  site_type?: string | null
}

/** An operator-placed obstacle the router avoids (blocks an H3 cell). */
export interface Obstacle {
  id: string
  h3_index: string
  kind: string
}

/** Partial tile mutation sent to PATCH /tiles/{h3}. */
export interface TileMutationRequest {
  threat_level?: number
  road_condition?: Tile['road_condition']
  intel_level?: Tile['intel_level']
  situation?: SectorSituation
  note?: string
}

// --- Fuel supply (Wave 5) ---

export interface FuelDepot {
  id: string
  name: string
  h3_index: string
  lat: number
  lon: number
  // NATO JLSG site type (v2 Wave 11 F5); null/absent for a plain depot.
  site_type?: string | null
}

export interface FuelStock {
  depot_id: string
  fuel_type: string
  quantity_liters: number
  capacity_liters: number
}

export interface DepotFuel {
  depot: FuelDepot
  stocks: FuelStock[]
}

export interface TruckFuel {
  instance_id: string
  name: string
  unit_type_id: string
  fuel_type: string
  current_fuel_liters: number | null
  capacity_liters: number
  lat: number
  lon: number
  h3_index: string
  // Unit this truck is tasked to refuel (open order), else null = on standby (v2 Wave 11).
  assigned_unit_id?: string | null
}

export interface SupplyOverview {
  depots: DepotFuel[]
  trucks: TruckFuel[]
  total_depot_liters_by_type: Record<string, number>
  total_truck_liters: number
}

export type BuyOrderStatus = 'pending' | 'active' | 'delivered' | 'cancelled'

export interface BuyOrder {
  id: string
  depot_id: string
  fuel_type: string
  quantity_liters: number
  status: BuyOrderStatus
  lead_time_game_s: number
  remaining_game_s: number
  // Order-mask metadata (v2 Wave 11 F3).
  platform_id?: string | null
  inform_jlsg?: boolean
  inform_jtf?: boolean
  destination_name?: string | null
  // NATO fulfilment stage tracking (v2 Wave 11 F4).
  nato_stage?: NatoStage
  stage_remaining_game_s?: number
}

export interface CreateBuyOrderRequest {
  depot_id: string
  fuel_type: string
  quantity_liters: number
  lead_time_game_s?: number
  // Order-mask metadata (v2 Wave 11 F3).
  platform_id?: string | null
  inform_jlsg?: boolean
  inform_jtf?: boolean
  destination_name?: string | null
}

/** A selectable fuel-management / procurement platform (v2 Wave 11 F2). */
export interface FuelPlatform {
  id: string
  name: string
  logo_key: string | null
  is_default: boolean
}

export interface CreateFuelPlatformRequest {
  name: string
  logo_key?: string | null
}

export type RefuelOrderStatus = 'pending' | 'active' | 'complete' | 'cancelled'

export interface RefuelOrder {
  id: string
  unit_id: string
  truck_id: string
  fuel_type: string
  status: RefuelOrderStatus
  rendezvous_lat: number
  rendezvous_lon: number
  rendezvous_h3: string
  requested_liters: number | null
  transferred_liters: number
}

export interface CreateRefuelOrderRequest {
  unit_id: string
  requested_liters?: number
}

/** Start a routed fuel run: dispatch a mover to a target + wire the refuel (v2 Wave 12). */
export interface CreateFuelRunRequest {
  mover_id: string
  unit_id: string
  truck_id?: string | null
  depot_id?: string | null
  dest_lat: number
  dest_lon: number
  metric: RouteMetric
  mode?: RouteMode
}

export interface FuelRunResponse {
  move_order: MoveOrder
  refuel_order: RefuelOrder
}

// --- Rendezvous fuel runs (v2 Wave 13) ---

/** The meeting sector: an H3 cell centre both movers route to. */
export interface SectorPoint {
  lat: number
  lon: number
  h3: string
}

export interface PlanRendezvousRequest {
  truck_id: string
  unit_id: string
  sector_lat: number
  sector_lon: number
  mode?: RouteMode
}

/** Both movers' Safe/Fast options to the sector; each option's fuel_consumed_l = fuel-to-meet. */
export interface RendezvousPlanResponse {
  sector: SectorPoint
  truck_routes: RouteOption[]
  unit_routes: RouteOption[]
}

export interface CreateRendezvousRequest {
  truck_id: string
  unit_id: string
  sector_lat: number
  sector_lon: number
  metric: RouteMetric
  mode?: RouteMode
}

export interface RendezvousResponse {
  sector: SectorPoint
  truck_move_order: MoveOrder
  unit_move_order: MoveOrder
  refuel_order: RefuelOrder
}

export type RendezvousOrderStatus = 'planned' | 'due' | 'launched' | 'cancelled'

/** A rendezvous fuel run planned against the sim clock (F2), filed in the order archive. */
export interface RendezvousOrder {
  id: string
  truck_id: string
  unit_id: string
  sector_lat: number
  sector_lon: number
  sector_h3: string
  metric: RouteMetric
  mode: RouteMode
  scheduled_game_s: number
  remaining_game_s: number
  truck_geometry: number[][]
  unit_geometry: number[][]
  truck_fuel_to_meet: number
  unit_fuel_to_meet: number
  status: RendezvousOrderStatus
}

export interface ScheduleRendezvousRequest {
  truck_id: string
  unit_id: string
  sector_lat: number
  sector_lon: number
  metric: RouteMetric
  mode?: RouteMode
  scheduled_game_s: number
}

export interface ConfirmLaunchResponse {
  rendezvous_order: RendezvousOrder
  truck_move_order: MoveOrder
  unit_move_order: MoveOrder
  refuel_order: RefuelOrder
}

/** Live frame broadcast when a scheduled rendezvous comes due (F2). */
export interface RendezvousReminder {
  type: 'rendezvous_reminder'
  order_id: string
  truck_id: string
  unit_id: string
  sector_lat: number
  sector_lon: number
  sector_h3: string
  metric: RouteMetric
  status: RendezvousOrderStatus
}

/** Live frame broadcast when a buy order's NATO stage changes / it is delivered (Wave 5 + W11 F4). */
export interface BuyOrderUpdate {
  type: 'buy_order_update'
  order_id: string
  depot_id: string
  fuel_type: string
  quantity_liters: number
  status: BuyOrderStatus
  remaining_game_s: number
  nato_stage?: NatoStage
  stage_remaining_game_s?: number
}

/** Live frame broadcast when a refuel transfer completes (Wave 5 refuel-orders). */
export interface RefuelOrderUpdate {
  type: 'refuel_order_update'
  order_id: string
  unit_id: string
  truck_id: string
  status: RefuelOrderStatus
  fuel_type: string
  transferred_liters: number
}

// --- Advice / optimization engine (Wave 6) ---

export type RecommendationKind = 'route' | 'reposition' | 'refuel' | 'redistribution'

export interface Recommendation {
  kind: RecommendationKind
  target: string
  action: Record<string, unknown>
  score: number
  rationale: string
}

export interface AdviceResult {
  kind: RecommendationKind
  recommendations: Recommendation[]
  summary: string | null
}

/** A scripted OF-8 strategic-support message broadcast over the WebSocket (Wave 5). */
export interface StrategicMessage {
  type: 'strategic_message'
  text: string
  category: string
  game_s: number
}

/** A live tile-change frame broadcast when a tile is mutated (Wave 4 dynamic-tile-updates). */
export interface TileUpdate {
  type: 'tile_update'
  h3_index: string
  terrain: TerrainType
  threat_level: number
  road_condition: Tile['road_condition']
  intel_level: Tile['intel_level']
  weather: Tile['weather']
  cover: Tile['cover']
  situation: SectorSituation | null
  note: string | null
}

/** Colour semantics for a located combat event (v2 Wave 3). */
export type CombatEventZone = 'combat' | 'blocked' | 'threat'

/**
 * A located, categorised, precision-tagged combat event (v2 Wave 3 located-event-model).
 * `precision_m` is the drawn MGRS-square side in metres; `zone` drives the colour
 * (combat → red, blocked → light-yellow, threat → graded by `estimated_threat`).
 */
export interface CombatEvent {
  type: 'combat_event'
  id: string
  category: string
  event: string
  lat: number
  lon: number
  precision_m: number
  estimated_threat: number
  sender: string
  zone: CombatEventZone
  game_s: number
}
