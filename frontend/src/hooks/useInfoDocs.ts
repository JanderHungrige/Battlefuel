// Loads the served Info Docs manifest (/docs/manifest.json, written by sync-assets) and groups
// the PDF filenames for the Info Docs tab (v2 Wave 11 F8). Fetches once when enabled.

import { useEffect, useState } from 'react'
import { type DocGroup, groupDocs } from '../lib/infoDocs'

export function useInfoDocs(enabled: boolean): { groups: DocGroup[] } {
  const [groups, setGroups] = useState<DocGroup[]>([])

  useEffect(() => {
    if (!enabled || groups.length > 0) return
    fetch('/docs/manifest.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((files: unknown) => {
        if (Array.isArray(files)) setGroups(groupDocs(files.filter((f): f is string => typeof f === 'string')))
      })
      .catch(() => {})
  }, [enabled, groups.length])

  return { groups }
}
