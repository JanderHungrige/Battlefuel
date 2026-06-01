// React hook owning a single WebSocket to the sim engine. Reduces unit_update frames
// into a per-instance position map and auto-reconnects after an unexpected close.

import { useEffect, useState } from 'react'
import type { TileUpdate, UnitUpdate } from '../api/types'
import { WS_BASE } from '../config'
import { applyTileUpdate, applyUnitUpdate, parseTileUpdate, parseUnitUpdate } from './simSocket'

const RECONNECT_MS = 2000

export interface SimSocketState {
  positions: Record<string, UnitUpdate>
  tileUpdates: Record<string, TileUpdate>
  connected: boolean
}

export function useSimSocket(enabled = true): SimSocketState {
  const [positions, setPositions] = useState<Record<string, UnitUpdate>>({})
  const [tileUpdates, setTileUpdates] = useState<Record<string, TileUpdate>>({})
  const [connected, setConnected] = useState(false)

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
        if (tile) setTileUpdates((prev) => applyTileUpdate(prev, tile))
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
  }, [enabled])

  return { positions, tileUpdates, connected }
}
