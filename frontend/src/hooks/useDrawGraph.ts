// Draw-graph state machine (v2 Wave 20 F3, draw-road-path-tool). Holds the active draw mode
// ('road' solid / 'path' dotted), the ordered waypoints the operator drops on the map, and the
// `finished` line produced by Stop — the hand-off consumed by F4 (connect-drawn-to-graph) to
// inject the line into the routing graph. Socket-free + side-effect-free so it unit-tests with
// plain calls (the established "thin hook" pattern).

import { useCallback, useState } from 'react'

export type DrawKind = 'road' | 'path'

export interface DrawPoint {
  lat: number
  lon: number
}

export interface FinishedDraw {
  kind: DrawKind
  points: DrawPoint[]
}

export interface DrawGraph {
  /** The active draw mode, or null when not drawing. */
  mode: DrawKind | null
  /** Ordered waypoints of the line being drawn. */
  points: DrawPoint[]
  /** A line moved out of the active draw by Stop, awaiting F4's connect/inject (else null). */
  finished: FinishedDraw | null
  /** Enter a draw mode (resets any in-progress line). */
  start: (kind: DrawKind) => void
  /** Append a waypoint at a map click (no-op when not drawing). */
  addPoint: (lat: number, lon: number) => void
  /** Drop the last waypoint. */
  removeLast: () => void
  /** Finish: a ≥2-point line becomes `finished`; the mode clears either way. */
  stop: () => void
  /** Discard the in-progress line and exit the mode (Esc / toggle off). */
  cancel: () => void
  /** Clear the finished line (after F4 consumed it, or to dismiss). */
  clearFinished: () => void
}

export function useDrawGraph(): DrawGraph {
  const [mode, setMode] = useState<DrawKind | null>(null)
  const [points, setPoints] = useState<DrawPoint[]>([])
  const [finished, setFinished] = useState<FinishedDraw | null>(null)

  const start = useCallback((kind: DrawKind) => {
    setMode(kind)
    setPoints([])
    setFinished(null)
  }, [])

  const addPoint = useCallback((lat: number, lon: number) => {
    setMode((m) => {
      if (m !== null) setPoints((pts) => [...pts, { lat, lon }])
      return m
    })
  }, [])

  const removeLast = useCallback(() => {
    setPoints((pts) => pts.slice(0, -1))
  }, [])

  const stop = useCallback(() => {
    setMode((m) => {
      setPoints((pts) => {
        if (m !== null && pts.length >= 2) setFinished({ kind: m, points: pts })
        return []
      })
      return null
    })
  }, [])

  const cancel = useCallback(() => {
    setMode(null)
    setPoints([])
  }, [])

  const clearFinished = useCallback(() => setFinished(null), [])

  return { mode, points, finished, start, addPoint, removeLast, stop, cancel, clearFinished }
}
