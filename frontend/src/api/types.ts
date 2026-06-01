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
  boundary: number[][] // ring of [lon, lat]
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
