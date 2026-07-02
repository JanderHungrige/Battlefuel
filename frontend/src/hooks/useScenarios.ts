// Saved-scenario list (v2 Wave 22 F5, scenario-save-load). Fetches when the panel is opened and
// exposes a refetch so save/delete can refresh the list.

import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { ScenarioSummary } from '../api/types'

export interface Scenarios {
  scenarios: ScenarioSummary[]
  refetch: () => void
}

export function useScenarios(enabled: boolean): Scenarios {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([])
  const [token, setToken] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let active = true
    api
      .getScenarios()
      .then((s) => {
        if (active) setScenarios(s)
      })
      .catch((e: unknown) => console.error('[scenarios] load failed:', e))
    return () => {
      active = false
    }
  }, [enabled, token])

  return { scenarios, refetch: () => setToken((n) => n + 1) }
}
