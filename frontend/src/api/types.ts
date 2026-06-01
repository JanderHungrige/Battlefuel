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
