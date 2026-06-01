// React hook owning a single WebSocket to the sim engine. Reduces unit_update frames
// into a per-instance position map and auto-reconnects after an unexpected close.

import { useEffect, useRef, useState } from 'react'
import type { TileAlert, TileUpdate, UnitUpdate } from '../api/types'
import { WS_BASE } from '../config'
import {
  applyTileUpdate,
  applyUnitUpdate,
  isThreatAlert,
  parseTileUpdate,
  parseUnitUpdate,
} from './simSocket'

const RECONNECT_MS = 2000
const MAX_ALERTS = 5 // keep only the most recent threat pop-ups

export interface SimSocketState {
  positions: Record<string, UnitUpdate>
  tileUpdates: Record<string, TileUpdate>
  tileAlerts: TileAlert[]
  connected: boolean
}

export function useSimSocket(enabled = true): SimSocketState {
  const [positions, setPositions] = useState<Record<string, UnitUpdate>>({})
  const [tileUpdates, setTileUpdates] = useState<Record<string, TileUpdate>>({})
  const [tileAlerts, setTileAlerts] = useState<TileAlert[]>([])
  const [connected, setConnected] = useState(false)
  const seq = useRef(0)

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
          if (isThreatAlert(tile)) {
            const alert: TileAlert = {
              id: (seq.current += 1),
              h3_index: tile.h3_index,
              threat_level: tile.threat_level,
              terrain: tile.terrain,
            }
            setTileAlerts((prev) => [...prev, alert].slice(-MAX_ALERTS))
          }
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
  }, [enabled])

  return { positions, tileUpdates, tileAlerts, connected }
}
