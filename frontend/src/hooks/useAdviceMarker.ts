// Derives the map marking for a selected advisor recommendation: a movement arrow + a cell to
// highlight. Movement endpoints by kind: route/reposition = unit→destination, refuel =
// truck→unit, redistribution transfer = depot→depot. Buy/other: highlight only.

import { useMemo } from 'react'
import type { FuelDepot, Recommendation, UnitInstance } from '../api/types'

type Pt = { lat: number; lon: number }

export interface AdviceMarker {
  arrow: { from: Pt; to: Pt } | null
  dest: Pt | null // destination point: the arrow endpoint, or the depot for a no-movement buy
  highlightH3: string | null
}

export function useAdviceMarker(
  rec: Recommendation | null,
  units: UnitInstance[],
  livePositions: Record<string, Pt>,
  depots: FuelDepot[],
): AdviceMarker {
  return useMemo(() => {
    const a = rec?.action
    if (!a) return { arrow: null, dest: null, highlightH3: null }
    const unitPos = (id: string): Pt | null => {
      const u = units.find((x) => x.id === id)
      return u ? (livePositions[u.id] ?? { lat: u.lat, lon: u.lon }) : null
    }
    const depot = (id: string): FuelDepot | null => depots.find((d) => d.id === id) ?? null

    let arrow: { from: Pt; to: Pt } | null = null
    if (
      typeof a.instance_id === 'string' &&
      typeof a.dest_lat === 'number' &&
      typeof a.dest_lon === 'number'
    ) {
      const from = unitPos(a.instance_id)
      arrow = from ? { from, to: { lat: a.dest_lat, lon: a.dest_lon } } : null
    } else if (typeof a.truck_id === 'string') {
      const from = unitPos(a.truck_id)
      const to = unitPos(rec.target)
      arrow = from && to ? { from, to } : null
    } else if (typeof a.from_depot === 'string' && typeof a.to_depot === 'string') {
      const f = depot(a.from_depot)
      const t = depot(a.to_depot)
      arrow = f && t ? { from: { lat: f.lat, lon: f.lon }, to: { lat: t.lat, lon: t.lon } } : null
    }

    // Destination point: the arrow endpoint, or — for a no-movement buy — the target depot.
    let dest: Pt | null = arrow ? arrow.to : null
    if (!dest && typeof a.depot_id === 'string') {
      const d = depot(a.depot_id)
      dest = d ? { lat: d.lat, lon: d.lon } : null
    }

    const highlightH3 =
      typeof a.to_depot === 'string'
        ? (depot(a.to_depot)?.h3_index ?? null)
        : typeof a.depot_id === 'string'
          ? (depot(a.depot_id)?.h3_index ?? null)
          : (units.find((u) => u.id === rec.target)?.h3_index ?? null)

    return { arrow, dest, highlightH3 }
  }, [rec, units, livePositions, depots])
}
