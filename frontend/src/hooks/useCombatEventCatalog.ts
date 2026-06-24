// Fetches the combat-event CSV catalog once (v2 Wave 4 F7), for the searchable obstacle picker.
// Lazy: only fetches when `enabled` first becomes true (i.e. obstacle mode is used), so the
// catalog isn't loaded for sessions that never open it.

import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { CombatEventCatalogItem } from '../api/types'

export function useCombatEventCatalog(enabled: boolean): CombatEventCatalogItem[] {
  const [items, setItems] = useState<CombatEventCatalogItem[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!enabled || loaded) return
    let active = true
    api
      .getCombatEventCatalog()
      .then((rows) => {
        if (active) {
          setItems(rows)
          setLoaded(true)
        }
      })
      .catch((e: unknown) => console.error('[catalog] load combat-event catalog failed:', e))
    return () => {
      active = false
    }
  }, [enabled, loaded])

  return items
}
