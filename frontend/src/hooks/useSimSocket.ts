// React hook owning a single WebSocket to the sim engine. Reduces unit_update frames into a
// per-instance position map, builds a chatter log from tile_update frames, and auto-reconnects.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatterMessage, TileUpdate, UnitUpdate } from '../api/types'
import { WS_BASE } from '../config'
import {
  applyTileUpdate,
  applyUnitUpdate,
  describeTileUpdate,
  parseTileUpdate,
  parseUnitUpdate,
} from './simSocket'

const RECONNECT_MS = 2000
const MAX_CHATTER = 50 // keep only the most recent radio lines

export interface SimSocketState {
  positions: Record<string, UnitUpdate>
  tileUpdates: Record<string, TileUpdate>
  chatter: ChatterMessage[]
  pushChatter: (text: string, kind?: ChatterMessage['kind'], h3Index?: string) => void
  connected: boolean
}

export function useSimSocket(enabled = true): SimSocketState {
  const [positions, setPositions] = useState<Record<string, UnitUpdate>>({})
  const [tileUpdates, setTileUpdates] = useState<Record<string, TileUpdate>>({})
  const [chatter, setChatter] = useState<ChatterMessage[]>([])
  const [connected, setConnected] = useState(false)
  const seq = useRef(0)

  const pushChatter = useCallback(
    (text: string, kind: ChatterMessage['kind'] = 'status', h3Index?: string) => {
      const msg: ChatterMessage = { id: (seq.current += 1), kind, text, h3_index: h3Index }
      setChatter((prev) => [...prev, msg].slice(-MAX_CHATTER))
    },
    [],
  )

  useEffect(() => {
    if (!enabled || typeof WebSocket === 'undefined') return

    let socket: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    let disposed = false

    const connect = (): void => {
      socket = new WebSocket(`${WS_BASE}/ws`)
      socket.onopen = () => setConnected(true)
      socket.onmessage = (e: MessageEvent) => {
        const raw = String(e.data)
        const unit = parseUnitUpdate(raw)
        if (unit) {
          setPositions((prev) => applyUnitUpdate(prev, unit))
          return
        }
        const tile = parseTileUpdate(raw)
        if (tile) {
          setTileUpdates((prev) => applyTileUpdate(prev, tile))
          pushChatter(`Sector: ${describeTileUpdate(tile)}`, 'status', tile.h3_index)
        }
      }
      socket.onclose = () => {
        setConnected(false)
        if (!disposed) retry = setTimeout(connect, RECONNECT_MS)
      }
      socket.onerror = () => socket?.close()
    }

    connect()
    return () => {
      disposed = true
      if (retry) clearTimeout(retry)
      socket?.close()
    }
  }, [enabled, pushChatter])

  return { positions, tileUpdates, chatter, pushChatter, connected }
}
