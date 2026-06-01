// Thin typed fetch wrapper around the BattleFuel API.

import { API_BASE } from '../config'
import type { Theater, Tile, UnitInstance, UnitType } from './types'

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

export const api = {
  getTheater: (): Promise<Theater> => getJson<Theater>('/theater'),
  getTiles: (): Promise<Tile[]> => getJson<Tile[]>('/tiles'),
  getUnitInstances: (): Promise<UnitInstance[]> => getJson<UnitInstance[]>('/unit-instances'),
  getUnitTypes: (): Promise<UnitType[]> => getJson<UnitType[]>('/units'),
  getUnitType: (id: string): Promise<UnitType> => getJson<UnitType>(`/units/${id}`),
}
