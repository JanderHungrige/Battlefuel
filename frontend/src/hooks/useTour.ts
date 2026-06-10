// "Take a tour" controller (v2: take-a-tour).
//
// Wraps driver.js for popover/arrow/spotlight positioning and layers the two run modes on top:
//   • guided — manual Next/Previous/Close buttons.
//   • auto   — advances on its own after a length-scaled delay (tourTiming); Space toggles pause.
// Only steps whose target is mounted are shown, so the tour matches the current role view. All the
// pure logic (timing, step selection) lives in ../lib so it is unit-tested without the DOM; this
// hook owns the DOM-bound orchestration and is exercised at the live `make dev` gate.

import { useCallback, useEffect, useRef, useState } from 'react'
import { driver, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import type { Role } from '../roles'
import { stepsForRole, type TourStep } from '../lib/tourSteps'
import { autoAdvanceDelayMs } from '../lib/tourTiming'

export type TourMode = 'guided' | 'auto'

export interface TourController {
  /** Start (or restart) the tour in the given mode. */
  start: (mode: TourMode) => void
  /** A tour is currently running. */
  active: boolean
  /** Auto-play is paused (Space). */
  paused: boolean
}

export function useTour(role: Role): TourController {
  const [active, setActive] = useState(false)
  const [paused, setPaused] = useState(false)

  const driverRef = useRef<Driver | null>(null)
  const modeRef = useRef<TourMode>('guided')
  const stepsRef = useRef<TourStep[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pausedRef = useRef(false)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // Schedule the auto-advance for the step currently shown (no-op unless auto + running + unpaused).
  const scheduleAdvance = useCallback(() => {
    clearTimer()
    if (modeRef.current !== 'auto' || pausedRef.current) return
    const d = driverRef.current
    if (!d || !d.isActive()) return
    const idx = d.getActiveIndex() ?? 0
    const step = stepsRef.current[idx]
    if (!step) return
    timerRef.current = setTimeout(() => {
      const dd = driverRef.current
      if (!dd || !dd.isActive() || pausedRef.current) return
      dd.moveNext()
    }, autoAdvanceDelayMs(step.text))
  }, [clearTimer])

  const reset = useCallback(() => {
    clearTimer()
    pausedRef.current = false
    setPaused(false)
    setActive(false)
    driverRef.current = null
  }, [clearTimer])

  const start = useCallback(
    (mode: TourMode) => {
      // Tear down any running tour first (re-runnable from the button).
      if (driverRef.current) {
        const prev = driverRef.current
        driverRef.current = null
        prev.destroy()
      }
      clearTimer()
      pausedRef.current = false
      setPaused(false)
      modeRef.current = mode

      // Current-view tour: keep only steps whose target is actually on screen.
      const steps = stepsForRole(role).filter((s) => document.querySelector(s.selector))
      stepsRef.current = steps
      if (steps.length === 0) return

      const d = driver({
        allowClose: true,
        overlayOpacity: 0.6,
        stagePadding: 6,
        showProgress: true,
        popoverClass: 'bf-tour',
        showButtons: mode === 'auto' ? ['close'] : ['next', 'previous', 'close'],
        steps: steps.map((s) => ({
          element: s.selector,
          popover: { title: s.title, description: s.text, side: s.side, align: s.align },
        })),
        onHighlighted: () => scheduleAdvance(),
        onDestroyed: () => reset(),
      })
      driverRef.current = d
      setActive(true)
      d.drive()
    },
    [role, scheduleAdvance, reset, clearTimer],
  )

  // Space toggles pause during an auto tour (preventing the default page scroll / button press).
  useEffect(() => {
    if (!active || modeRef.current !== 'auto') return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return
      e.preventDefault()
      const next = !pausedRef.current
      pausedRef.current = next
      setPaused(next)
      if (next) clearTimer()
      else scheduleAdvance()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, scheduleAdvance, clearTimer])

  // Tear down on unmount.
  useEffect(
    () => () => {
      clearTimer()
      driverRef.current?.destroy()
    },
    [clearTimer],
  )

  return { start, active, paused }
}
