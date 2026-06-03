// TypeScript mirrors of the backend API schemas (the contract between the two).

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

export type MoveOrderStatus = 'pending' | 'active' | 'complete' | 'cancelled'

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
}

export interface CreateBuyOrderRequest {
  depot_id: string
  fuel_type: string
  quantity_liters: number
  lead_time_game_s?: number
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

/** Live frame broadcast when a buy order is delivered (Wave 5 buy-orders). */
export interface BuyOrderUpdate {
  type: 'buy_order_update'
  order_id: string
  depot_id: string
  fuel_type: string
  quantity_liters: number
  status: BuyOrderStatus
  remaining_game_s: number
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
