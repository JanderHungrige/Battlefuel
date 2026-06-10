// "Take a tour" button + mode chooser (v2: take-a-tour).
//
// Sits in the topbar just before the OpenStreetMap attribution. Clicking opens a small chooser:
// Guided (manual Next) or Auto-play (advances on its own, Space pauses). While auto-play is paused
// a ⏸ indicator shows next to the button.

import { useEffect, useRef, useState } from 'react'
import type { Role } from '../roles'
import { useTour, type TourMode } from '../hooks/useTour'
import './TourButton.css'

export function TourButton({ role }: { role: Role }) {
  const tour = useTour(role)
  const [menuOpen, setMenuOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  // Close the chooser on an outside click.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  const launch = (mode: TourMode) => {
    setMenuOpen(false)
    tour.start(mode)
  }

  return (
    <div className="tour" data-tour="tour-button" ref={ref}>
      <button
        type="button"
        className="tour-btn"
        data-testid="take-a-tour"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((o) => !o)}
      >
        Take a tour
      </button>
      {tour.paused && (
        <span
          className="tour-paused"
          data-testid="tour-paused"
          title="Paused — press Space to resume"
          aria-label="Tour paused"
        >
          ⏸
        </span>
      )}
      {menuOpen && (
        <div className="tour-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="tour-menu-item"
            data-testid="tour-guided"
            onClick={() => launch('guided')}
          >
            <strong>Guided</strong>
            <span>Step through at your own pace with “Next”.</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="tour-menu-item"
            data-testid="tour-auto"
            onClick={() => launch('auto')}
          >
            <strong>Auto-play ▷</strong>
            <span>Advances on its own — Space pauses. For demos &amp; shows.</span>
          </button>
        </div>
      )}
    </div>
  )
}
