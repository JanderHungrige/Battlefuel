// "Take a tour" controller (v2: take-a-tour).
//
// Wraps driver.js for popover/arrow/spotlight positioning and layers the two run modes on top:
//   • guided — manual Next/Previous/Close buttons.
//   • auto   — advances on its own after a length-scaled delay (tourTiming); Space toggles pause.
//
// Some steps reveal their successor's target via a `before` action run as the step is shown — a
// sub-tab click (DOM) or a named app action like selecting a demo unit (via the actions map). The
// pure logic (timing, step selection) lives in ../lib and is unit-tested; this hook owns the
// DOM-bound orchestration and is exercised at the live `make dev` gate.

import { useCallback, useEffect, useRef, useState } from 'react'
import { driver, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import type { Role } from '../roles'
import { stepsForRole, type TourActionKey, type TourStep } from '../lib/tourSteps'
import { autoAdvanceDelayMs } from '../lib/tourTiming'

export type TourMode = 'guided' | 'auto'
export type TourActions = Partial<Record<TourActionKey, () => void>>

export interface TourController {
  /** Start (or restart) the tour in the given mode. */
  start: (mode: TourMode) => void
  /** A tour is currently running. */
  active: boolean
  /** Auto-play is paused (Space). */
  paused: boolean
}

/** Run a step's `before`: click a selector (e.g. switch a sub-tab) and/or fire an app action. */
function runBefore(step: TourStep | undefined, actions: TourActions): void {
  if (!step?.before) return
  const { click, action } = step.before
  if (click) {
    const el = document.querySelector<HTMLElement>(click)
    el?.click()
  }
  if (action) actions[action]?.()
}

export function useTour(role: Role, actions: TourActions = {}, onEnd?: () => void): TourController {
  const [active, setActive] = useState(false)
  const [paused, setPaused] = useState(false)

  const driverRef = useRef<Driver | null>(null)
  const modeRef = useRef<TourMode>('guided')
  const stepsRef = useRef<TourStep[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pausedRef = useRef(false)
  const actionsRef = useRef<TourActions>(actions)
  const onEndRef = useRef<typeof onEnd>(onEnd)
  useEffect(() => {
    actionsRef.current = actions
  }, [actions])
  useEffect(() => {
    onEndRef.current = onEnd
  }, [onEnd])

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
    onEndRef.current?.()
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

      // Keep steps whose target is present now, plus every step from the first gated step onward
      // (a `before` action mounts later targets) so tab-/selection-gated steps aren't dropped.
      let armed = false
      const steps = stepsForRole(role).filter((s) => {
        if (s.before) armed = true
        return armed || Boolean(document.querySelector(s.selector))
      })
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
        // Run the step's `before` as it is shown — it enables the *next* step's target. Reposition
        // after, since switching a sub-tab can shift layout under a stable anchor.
        onHighlightStarted: (_el, _step, opts) => {
          const idx = opts.state.activeIndex ?? 0
          runBefore(stepsRef.current[idx], actionsRef.current)
          setTimeout(() => driverRef.current?.refresh(), 60)
        },
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
