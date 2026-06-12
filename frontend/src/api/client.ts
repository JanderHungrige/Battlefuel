// Thin typed fetch wrapper around the BattleFuel API.

import { API_BASE } from '../config'
import type {
  AdviceResult,
  BuyOrder,
  CreateBuyOrderRequest,
  CreateDepotRequest,
  CreateFuelPlatformRequest,
  CreateFuelRunRequest,
  CreateMoveOrderRequest,
  CreateRefuelOrderRequest,
  CreateRendezvousRequest,
  CreateWaypointMoveOrderRequest,
  ConfirmLaunchResponse,
  FuelRunResponse,
  MoveRefuelOption,
  MoveRefuelOptionsRequest,
  MoveWithRefuelRequest,
  MoveWithRefuelResponse,
  EnemyUnit,
  FuelDepot,
  FuelPlatform,
  FuelStock,
  MoveOrder,
  Obstacle,
  PlanRendezvousRequest,
  PlanRouteRequest,
  PlanWaypointsRequest,
  RefuelOrder,
  RendezvousOrder,
  RendezvousPlanResponse,
  RendezvousResponse,
  RouteOption,
  ScheduleRendezvousRequest,
  SupplyOverview,
  Theater,
  Tile,
  TileMutationRequest,
  UnitInstance,
  UnitType,
} from './types'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) {
    throw new ApiError(res.status, `GET ${path} failed: ${res.status}`)
  }
  return (await res.json()) as T
}

async function sendJson<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    throw new ApiError(res.status, `${method} ${path} failed: ${res.status}`)
  }
  return (await res.json()) as T
}

const postJson = <T>(path: string, body?: unknown): Promise<T> => sendJson<T>('POST', path, body)
const patchJson = <T>(path: string, body?: unknown): Promise<T> => sendJson<T>('PATCH', path, body)
const deleteJson = <T>(path: string): Promise<T> => sendJson<T>('DELETE', path)

export const api = {
  getTheater: (): Promise<Theater> => getJson<Theater>('/theater'),
  getTiles: (): Promise<Tile[]> => getJson<Tile[]>('/tiles'),
  getUnitInstances: (): Promise<UnitInstance[]> => getJson<UnitInstance[]>('/unit-instances'),
  setTelemetry: (id: string, currentFuelLiters: number): Promise<UnitInstance> =>
    postJson<UnitInstance>(`/unit-instances/${id}/telemetry`, {
      current_fuel_liters: currentFuelLiters,
    }),
  getEnemyUnits: (): Promise<EnemyUnit[]> => getJson<EnemyUnit[]>('/enemy-units'),
  getUnitTypes: (): Promise<UnitType[]> => getJson<UnitType[]>('/units'),
  getUnitType: (id: string): Promise<UnitType> => getJson<UnitType>(`/units/${id}`),

  // Routing & movement (Wave 3).
  planRoute: (req: PlanRouteRequest): Promise<RouteOption[]> =>
    postJson<RouteOption[]>('/routes/plan', req),
  // Plan fastest+safest through an ordered list of waypoints (v2 Wave 10 F5).
  planWaypoints: (req: PlanWaypointsRequest): Promise<RouteOption[]> =>
    postJson<RouteOption[]>('/routes/plan-waypoints', req),
  createMoveOrder: (req: CreateMoveOrderRequest): Promise<MoveOrder> =>
    postJson<MoveOrder>('/move-orders', req),
  createWaypointMoveOrder: (req: CreateWaypointMoveOrderRequest): Promise<MoveOrder> =>
    postJson<MoveOrder>('/move-orders/waypoints', req),
  // Preview refuel-stop options (per tanker) for a planned move — no dispatch (v2 W13).
  moveRefuelOptions: (req: MoveRefuelOptionsRequest): Promise<MoveRefuelOption[]> =>
    postJson<MoveRefuelOption[]>('/move-orders/refuel-options', req),
  // Execute a move with a refuel stop on the way (the chosen tanker) (v2 W13 F6).
  moveWithRefuel: (req: MoveWithRefuelRequest): Promise<MoveWithRefuelResponse> =>
    postJson<MoveWithRefuelResponse>('/move-orders/with-refuel', req),
  confirmMoveOrder: (id: string): Promise<MoveOrder> =>
    postJson<MoveOrder>(`/move-orders/${id}/confirm`),
  cancelMoveOrder: (id: string): Promise<MoveOrder> =>
    postJson<MoveOrder>(`/move-orders/${id}/cancel`),
  // "Proceed slowly" across an obstruction a unit halted at: halted → crossing (v2 Wave 10 F1).
  proceedMoveOrder: (id: string): Promise<MoveOrder> =>
    postJson<MoveOrder>(`/move-orders/${id}/proceed`),
  // "Continue" across a threat tile at normal speed: halted → continuing (v2 W13 F5).
  continueMoveOrder: (id: string): Promise<MoveOrder> =>
    postJson<MoveOrder>(`/move-orders/${id}/continue`),
  listMoveOrders: (): Promise<MoveOrder[]> => getJson<MoveOrder[]>('/move-orders'),

  // Operator ops (Wave 4).
  listObstacles: (): Promise<Obstacle[]> => getJson<Obstacle[]>('/obstacles'),
  createObstacle: (lat: number, lon: number, kind = 'manual'): Promise<Obstacle> =>
    postJson<Obstacle>('/obstacles', { lat, lon, kind }),
  deleteObstacle: (id: string): Promise<{ id: string; status: string }> =>
    deleteJson<{ id: string; status: string }>(`/obstacles/${id}`),
  patchTile: (h3Index: string, mutation: TileMutationRequest): Promise<Tile> =>
    patchJson<Tile>(`/tiles/${h3Index}`, mutation),

  // Fuel supply (Wave 5).
  getDepots: (): Promise<FuelDepot[]> => getJson<FuelDepot[]>('/depots'),
  createDepot: (req: CreateDepotRequest): Promise<FuelDepot> =>
    postJson<FuelDepot>('/depots', req),
  deleteDepot: (id: string): Promise<{ id: string; status: string }> =>
    deleteJson<{ id: string; status: string }>(`/depots/${id}`),
  getFuelStocks: (): Promise<FuelStock[]> => getJson<FuelStock[]>('/fuel-stocks'),
  getSupplyOverview: (): Promise<SupplyOverview> => getJson<SupplyOverview>('/supply/overview'),
  createBuyOrder: (req: CreateBuyOrderRequest): Promise<BuyOrder> =>
    postJson<BuyOrder>('/buy-orders', req),
  getBuyOrders: (): Promise<BuyOrder[]> => getJson<BuyOrder[]>('/buy-orders'),

  // Fuel-management platforms (v2 Wave 11 F2).
  getFuelPlatforms: (): Promise<FuelPlatform[]> => getJson<FuelPlatform[]>('/fuel-platforms'),
  createFuelPlatform: (req: CreateFuelPlatformRequest): Promise<FuelPlatform> =>
    postJson<FuelPlatform>('/fuel-platforms', req),
  confirmBuyOrder: (id: string): Promise<BuyOrder> => postJson<BuyOrder>(`/buy-orders/${id}/confirm`),
  cancelBuyOrder: (id: string): Promise<BuyOrder> => postJson<BuyOrder>(`/buy-orders/${id}/cancel`),
  createRefuelOrder: (req: CreateRefuelOrderRequest): Promise<RefuelOrder> =>
    postJson<RefuelOrder>('/refuel-orders', req),
  createFuelRun: (req: CreateFuelRunRequest): Promise<FuelRunResponse> =>
    postJson<FuelRunResponse>('/fuel-runs', req),

  // Rendezvous fuel runs (v2 Wave 13): both movers route to a sector.
  planRendezvous: (req: PlanRendezvousRequest): Promise<RendezvousPlanResponse> =>
    postJson<RendezvousPlanResponse>('/rendezvous/plan', req),
  createRendezvous: (req: CreateRendezvousRequest): Promise<RendezvousResponse> =>
    postJson<RendezvousResponse>('/rendezvous', req),
  scheduleRendezvous: (req: ScheduleRendezvousRequest): Promise<RendezvousOrder> =>
    postJson<RendezvousOrder>('/rendezvous/schedule', req),
  listRendezvous: (): Promise<RendezvousOrder[]> => getJson<RendezvousOrder[]>('/rendezvous'),
  getRendezvous: (id: string): Promise<RendezvousOrder> =>
    getJson<RendezvousOrder>(`/rendezvous/${id}`),
  confirmLaunchRendezvous: (id: string): Promise<ConfirmLaunchResponse> =>
    postJson<ConfirmLaunchResponse>(`/rendezvous/${id}/confirm-launch`),
  cancelRendezvous: (id: string): Promise<RendezvousOrder> =>
    postJson<RendezvousOrder>(`/rendezvous/${id}/cancel`),
  confirmRefuelOrder: (id: string): Promise<RefuelOrder> =>
    postJson<RefuelOrder>(`/refuel-orders/${id}/confirm`),
  cancelRefuelOrder: (id: string): Promise<RefuelOrder> =>
    postJson<RefuelOrder>(`/refuel-orders/${id}/cancel`),

  // Advice / optimization engine (Wave 6).
  getReposition: (): Promise<AdviceResult> => getJson<AdviceResult>('/advice/reposition'),
  getRefuelPlan: (): Promise<AdviceResult> => getJson<AdviceResult>('/advice/refuel-plan'),
  getRedistribution: (): Promise<AdviceResult> => getJson<AdviceResult>('/advice/redistribution'),
  // Per-site low-fuel refuel proposal (v2 Wave 11 F5).
  getSiteRefuel: (depotId: string): Promise<AdviceResult> =>
    getJson<AdviceResult>(`/advice/site-refuel/${encodeURIComponent(depotId)}`),
  getRouteAdvice: (instanceId: string, destLat: number, destLon: number): Promise<AdviceResult> =>
    getJson<AdviceResult>(
      `/advice/route?instance_id=${encodeURIComponent(instanceId)}&dest_lat=${destLat}&dest_lon=${destLon}`,
    ),
}
