// React hook owning a single WebSocket to the sim engine. Reduces unit_update frames into a
// per-instance position map, builds a chatter log from tile_update frames, and auto-reconnects.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatterMessage, CombatEvent, TileUpdate, UnitUpdate } from '../api/types'
import { WS_BASE } from '../config'
import {
  applyCombatEvent,
  applyTileUpdate,
  applyUnitUpdate,
  combatEventMgrs,
  describeBuyOrderUpdate,
  describeRefuelOrderUpdate,
  describeTileUpdate,
  parseBuyOrderUpdate,
  parseCombatEvent,
  parseRefuelOrderUpdate,
  parseStrategicMessage,
  parseTileUpdate,
  parseUnitUpdate,
} from './simSocket'

const RECONNECT_MS = 2000
const MAX_CHATTER = 10 // FIFO: keep only the 10 most recent radio lines (oldest drop off)

export interface SimSocketState {
  positions: Record<string, UnitUpdate>
  tileUpdates: Record<string, TileUpdate>
  /** Located combat events keyed by id (latest frame wins) — drives Wave-3 threat squares. */
  combatEvents: Record<string, CombatEvent>
  chatter: ChatterMessage[]
  /** OF-8 strategic-support feed: scripted strategic messages + supply-order notifications. */
  strategic: ChatterMessage[]
  pushChatter: (text: string, kind?: ChatterMessage['kind'], h3Index?: string) => void
  connected: boolean
  /** Bumped whenever a supply order (buy/refuel) frame arrives — consumers refetch on change. */
  supplyTick: number
}

export function useSimSocket(enabled = true): SimSocketState {
  const [positions, setPositions] = useState<Record<string, UnitUpdate>>({})
  const [tileUpdates, setTileUpdates] = useState<Record<string, TileUpdate>>({})
  const [combatEvents, setCombatEvents] = useState<Record<string, CombatEvent>>({})
  const [chatter, setChatter] = useState<ChatterMessage[]>([])
  const [strategic, setStrategic] = useState<ChatterMessage[]>([])
  const [connected, setConnected] = useState(false)
  const [supplyTick, setSupplyTick] = useState(0)
  const seq = useRef(0)
  // Combat-event ids already logged to chatter — so the on-connect snapshot + the timed feed
  // don't produce duplicate radio lines for the same event.
  const loggedCombat = useRef<Set<string>>(new Set())

  const pushChatter = useCallback(
    (text: string, kind: ChatterMessage['kind'] = 'status', h3Index?: string) => {
      const msg: ChatterMessage = { id: (seq.current += 1), kind, text, h3_index: h3Index }
      setChatter((prev) => [...prev, msg].slice(-MAX_CHATTER))
    },
    [],
  )

  const pushStrategic = useCallback((text: string, kind: ChatterMessage['kind'] = 'status') => {
    const msg: ChatterMessage = { id: (seq.current += 1), kind, text }
    setStrategic((prev) => [...prev, msg].slice(-MAX_CHATTER))
  }, [])

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
          return
        }
        const buy = parseBuyOrderUpdate(raw)
        if (buy) {
          setSupplyTick((n) => n + 1)
          pushStrategic(describeBuyOrderUpdate(buy), 'order')
          return
        }
        const refuel = parseRefuelOrderUpdate(raw)
        if (refuel) {
          setSupplyTick((n) => n + 1)
          pushStrategic(describeRefuelOrderUpdate(refuel), 'order')
          return
        }
        const combat = parseCombatEvent(raw)
        if (combat) {
          setCombatEvents((prev) => applyCombatEvent(prev, combat))
          if (!loggedCombat.current.has(combat.id)) {
            loggedCombat.current.add(combat.id)
            const msg: ChatterMessage = {
              id: (seq.current += 1),
              kind: 'status',
              text: combat.event,
              mgrs: combatEventMgrs(combat),
              sender: combat.sender,
              event_id: combat.id,
              lat: combat.lat,
              lon: combat.lon,
            }
            setChatter((prev) => [...prev, msg].slice(-MAX_CHATTER))
          }
          return
        }
        const strat = parseStrategicMessage(raw)
        if (strat) {
          pushStrategic(strat.text, 'status')
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
  }, [enabled, pushChatter, pushStrategic])

  return {
    positions,
    tileUpdates,
    combatEvents,
    chatter,
    strategic,
    pushChatter,
    connected,
    supplyTick,
  }
}
