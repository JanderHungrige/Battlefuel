// React hook owning a single WebSocket to the sim engine. Reduces unit_update frames into a
// per-instance position map, builds a chatter log from tile_update frames, and auto-reconnects.

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ChatterMessage,
  EnemyUnit,
  RendezvousReminder,
  TileUpdate,
  UnitUpdate,
} from '../api/types'
import { WS_BASE } from '../config'
import {
  applyEnemyUnit,
  applyTileUpdate,
  applyUnitUpdate,
  describeBuyOrderUpdate,
  describeRefuelOrderUpdate,
  describeRendezvousReminder,
  parseBuyOrderUpdate,
  parseEnemyUnit,
  parseEnemyUnitRemoved,
  parseRefuelOrderUpdate,
  parseRendezvousReminder,
  parseStrategicMessage,
  parseTileUpdate,
  parseUnitUpdate,
  removeEnemyUnit,
  tileEventChatter,
} from './simSocket'

const RECONNECT_MS = 2000
const MAX_CHATTER = 10 // FIFO: keep only the 10 most recent radio lines (oldest drop off)

export interface SimSocketState {
  positions: Record<string, UnitUpdate>
  tileUpdates: Record<string, TileUpdate>
  /** Chatter-driven enemy sightings keyed by id (unify); merged with the seed force, removed on revert. */
  enemySightings: Record<string, EnemyUnit>
  chatter: ChatterMessage[]
  /** OF-8 strategic-support feed: scripted strategic messages + supply-order notifications. */
  strategic: ChatterMessage[]
  pushChatter: (text: string, kind?: ChatterMessage['kind'], h3Index?: string) => void
  connected: boolean
  /** Bumped whenever a supply order (buy/refuel/rendezvous) frame arrives — refetch on change. */
  supplyTick: number
  /** The latest scheduled rendezvous that came due (v2 Wave 13 F4); drives the reminder banner. */
  rendezvousReminder: RendezvousReminder | null
}

export function useSimSocket(enabled = true): SimSocketState {
  const [positions, setPositions] = useState<Record<string, UnitUpdate>>({})
  const [tileUpdates, setTileUpdates] = useState<Record<string, TileUpdate>>({})
  const [enemySightings, setEnemySightings] = useState<Record<string, EnemyUnit>>({})
  const [chatter, setChatter] = useState<ChatterMessage[]>([])
  const [strategic, setStrategic] = useState<ChatterMessage[]>([])
  const [connected, setConnected] = useState(false)
  const [supplyTick, setSupplyTick] = useState(0)
  const [rendezvousReminder, setRendezvousReminder] = useState<RendezvousReminder | null>(null)
  const seq = useRef(0)

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
          // Unified chatter: a located catalog event stamped on the tile becomes a "<MGRS> —
          // <headline>" line. Reverts/decays carry no event and just update the map silently.
          const line = tileEventChatter(tile, (seq.current += 1))
          if (line) setChatter((prev) => [...prev, line].slice(-MAX_CHATTER))
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
        const reminder = parseRendezvousReminder(raw)
        if (reminder) {
          setSupplyTick((n) => n + 1) // refetch the archive (the order is now `due`)
          setRendezvousReminder(reminder)
          pushStrategic(describeRendezvousReminder(reminder), 'order')
          return
        }
        const enemy = parseEnemyUnit(raw)
        if (enemy) {
          setEnemySightings((prev) => applyEnemyUnit(prev, enemy))
          return
        }
        const enemyRemoved = parseEnemyUnitRemoved(raw)
        if (enemyRemoved) {
          setEnemySightings((prev) => removeEnemyUnit(prev, enemyRemoved))
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
    enemySightings,
    chatter,
    strategic,
    pushChatter,
    connected,
    supplyTick,
    rendezvousReminder,
  }
}
