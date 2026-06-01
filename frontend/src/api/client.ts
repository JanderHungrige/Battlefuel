// Thin typed fetch wrapper around the BattleFuel API.

import { API_BASE } from '../config'
import type {
  CreateMoveOrderRequest,
  MoveOrder,
  PlanRouteRequest,
  RouteOption,
  Theater,
  Tile,
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

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    throw new ApiError(res.status, `POST ${path} failed: ${res.status}`)
  }
  return (await res.json()) as T
}

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
}
