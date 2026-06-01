// React hook owning a single WebSocket to the sim engine. Reduces unit_update frames
// into a per-instance position map and auto-reconnects after an unexpected close.

import { useEffect, useState } from 'react'
import type { UnitUpdate } from '../api/types'
import { WS_BASE } from '../config'
import { applyUnitUpdate, parseUnitUpdate } from './simSocket'

const RECONNECT_MS = 2000

export interface SimSocketState {
  positions: Record<string, UnitUpdate>
  connected: boolean
}

export function useSimSocket(enabled = true): SimSocketState {
  const [positions, setPositions] = useState<Record<string, UnitUpdate>>({})
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
        const update = parseUnitUpdate(String(e.data))
        if (update) setPositions((prev) => applyUnitUpdate(prev, update))
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

  return { positions, connected }
}
