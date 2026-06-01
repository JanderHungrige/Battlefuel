// Bootstrap load of the static world: theater, tiles, unit instances, and the unit catalog.
// Owns the roster state (units) so telemetry updates can patch it; everything else is read-only.

import { type Dispatch, type SetStateAction, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Theater, Tile, UnitInstance, UnitType } from '../api/types'

export interface TheaterData {
  theater: Theater | null
  tiles: Tile[]
  units: UnitInstance[]
  setUnits: Dispatch<SetStateAction<UnitInstance[]>>
  unitTypes: UnitType[]
  error: string | null
}

export function useTheaterData(): TheaterData {
  const [theater, setTheater] = useState<Theater | null>(null)
  const [tiles, setTiles] = useState<Tile[]>([])
  const [units, setUnits] = useState<UnitInstance[]>([])
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([api.getTheater(), api.getTiles(), api.getUnitInstances(), api.getUnitTypes()])
      .then(([t, ti, u, ut]) => {
        if (!active) return
        setTheater(t)
        setTiles(ti)
        setUnits(u)
        setUnitTypes(ut)
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      active = false
    }
  }, [])

  return { theater, tiles, units, setUnits, unitTypes, error }
}
