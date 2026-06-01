// Unit-overview open/toggle state + manual telemetry update (Wave 5 unit-overview-telemetry).
// Keeps App lean: owns the telemetry POST and patches the roster so the no-data flag clears.

import { type Dispatch, type SetStateAction, useCallback, useState } from 'react'
import { api } from '../api/client'
import type { UnitInstance } from '../api/types'

export interface UnitOverviewState {
  open: boolean
  toggle: () => void
  setTelemetry: (id: string, liters: number) => void
}

export function useUnitOverview(
  setUnits: Dispatch<SetStateAction<UnitInstance[]>>,
): UnitOverviewState {
  const [open, setOpen] = useState(false)
  const toggle = useCallback(() => setOpen((o) => !o), [])

  const setTelemetry = useCallback(
    (id: string, liters: number) => {
      api
        .setTelemetry(id, liters)
        .then((updated) => setUnits((prev) => prev.map((u) => (u.id === id ? updated : u))))
        .catch(() => {})
    },
    [setUnits],
  )

  return { open, toggle, setTelemetry }
}
