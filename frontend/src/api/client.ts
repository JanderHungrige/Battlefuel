// Thin typed fetch wrapper around the BattleFuel API.

import { API_BASE } from '../config'
import type {
  CreateMoveOrderRequest,
  MoveOrder,
  Obstacle,
  PlanRouteRequest,
  RouteOption,
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
  getUnitTypes: (): Promise<UnitType[]> => getJson<UnitType[]>('/units'),
  getUnitType: (id: string): Promise<UnitType> => getJson<UnitType>(`/units/${id}`),

  // Routing & movement (Wave 3).
  planRoute: (req: PlanRouteRequest): Promise<RouteOption[]> =>
    postJson<RouteOption[]>('/routes/plan', req),
  createMoveOrder: (req: CreateMoveOrderRequest): Promise<MoveOrder> =>
    postJson<MoveOrder>('/move-orders', req),
  confirmMoveOrder: (id: string): Promise<MoveOrder> =>
    postJson<MoveOrder>(`/move-orders/${id}/confirm`),
  cancelMoveOrder: (id: string): Promise<MoveOrder> =>
    postJson<MoveOrder>(`/move-orders/${id}/cancel`),
  listMoveOrders: (): Promise<MoveOrder[]> => getJson<MoveOrder[]>('/move-orders'),

  // Operator ops (Wave 4).
  listObstacles: (): Promise<Obstacle[]> => getJson<Obstacle[]>('/obstacles'),
  createObstacle: (lat: number, lon: number, kind = 'manual'): Promise<Obstacle> =>
    postJson<Obstacle>('/obstacles', { lat, lon, kind }),
  deleteObstacle: (id: string): Promise<{ id: string; status: string }> =>
    deleteJson<{ id: string; status: string }>(`/obstacles/${id}`),
  patchTile: (h3Index: string, mutation: TileMutationRequest): Promise<Tile> =>
    patchJson<Tile>(`/tiles/${h3Index}`, mutation),
}
