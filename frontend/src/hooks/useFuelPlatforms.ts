// Loads the OF-8 fuel-management platforms and tracks the selected one (v2 Wave 11 F2).
// The selected platform drives the order-mask branding (F3). Only fetches while enabled
// (the OF-8 view is active). Adding a platform appends it and selects it.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import type { FuelPlatform } from '../api/types'

export interface FuelPlatformsState {
  platforms: FuelPlatform[]
  selectedId: string
  selectedPlatform: FuelPlatform | null
  setSelectedId: (id: string) => void
  addPlatform: (name: string) => Promise<void>
}

/** The platform that should be selected by default: the `is_default` one, else the first. */
export function defaultPlatformId(platforms: FuelPlatform[]): string {
  return (platforms.find((p) => p.is_default) ?? platforms[0])?.id ?? ''
}

export function useFuelPlatforms(enabled: boolean): FuelPlatformsState {
  const [platforms, setPlatforms] = useState<FuelPlatform[]>([])
  const [selectedId, setSelectedId] = useState('')

  useEffect(() => {
    if (!enabled) return
    api
      .getFuelPlatforms()
      .then((list) => {
        setPlatforms(list)
        // Seed the selection once, when it is empty or no longer points at a known platform.
        setSelectedId((cur) => (list.some((p) => p.id === cur) ? cur : defaultPlatformId(list)))
      })
      .catch(() => {})
  }, [enabled])

  const addPlatform = useCallback(async (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const created = await api.createFuelPlatform({ name: trimmed })
    setPlatforms((prev) =>
      prev.some((p) => p.id === created.id) ? prev : [...prev, created],
    )
    setSelectedId(created.id)
  }, [])

  // Fall back to the default if the stored id is not (yet) a known platform.
  const effectiveId = platforms.some((p) => p.id === selectedId)
    ? selectedId
    : defaultPlatformId(platforms)
  const selectedPlatform = useMemo(
    () => platforms.find((p) => p.id === effectiveId) ?? null,
    [platforms, effectiveId],
  )

  return { platforms, selectedId: effectiveId, selectedPlatform, setSelectedId, addPlatform }
}
