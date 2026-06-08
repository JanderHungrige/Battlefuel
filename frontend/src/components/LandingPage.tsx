// Branded landing page (v2 Wave 15 F1): a dark, modern front door with an animated background,
// the BattleFuel hero, a faux "security clearance" check that resolves to APPROVED, an Enter
// button into the app, and a "powered by" row (Eraneos + World Fuel). Presentational — the parent
// (App) owns whether the gate is shown; the gate is in-memory only, so it shows on every page
// load / refresh. The verify delay is injectable so tests don't wait on a real timer.

import { useEffect, useState } from 'react'
import './LandingPage.css'

export interface LandingPageProps {
  onEnter: () => void
  /** ms before the faux clearance check flips to APPROVED (override to 0 in tests). */
  verifyMs?: number
}

export function LandingPage({ onEnter, verifyMs = 1600 }: LandingPageProps) {
  const [approved, setApproved] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setApproved(true), verifyMs)
    return () => clearTimeout(t)
  }, [verifyMs])

  return (
    <div className="landing" data-testid="landing">
      <div className="landing-bg" aria-hidden="true">
        <div className="landing-grid" />
        <div className="landing-glow landing-glow-amber" />
        <div className="landing-glow landing-glow-blue" />
        <div className="landing-scan" />
      </div>

      <main className="landing-card">
        <p className="landing-eyebrow">Joint Fuel Logistics Command</p>
        <h1 className="landing-wordmark">
          BATTLE<span className="landing-wordmark-accent">FUEL</span>
        </h1>
        <p className="landing-tagline">
          Fuel logistics &amp; supply-chain orchestration — decision support for the contested fight.
        </p>

        <div
          className={`landing-clearance ${approved ? 'is-approved' : 'is-checking'}`}
          data-testid="landing-clearance"
          role="status"
          aria-live="polite"
        >
          {approved ? (
            <>
              <span className="landing-clearance-tick" aria-hidden="true">
                ✓
              </span>
              <span className="landing-clearance-text" data-testid="landing-approved">
                User security access: <strong>APPROVED</strong>
              </span>
            </>
          ) : (
            <>
              <span className="landing-spinner" aria-hidden="true" />
              <span className="landing-clearance-text">
                Verifying clearance<span className="landing-dots" aria-hidden="true" />
              </span>
            </>
          )}
        </div>

        <button
          type="button"
          className="landing-enter"
          data-testid="landing-enter"
          disabled={!approved}
          onClick={onEnter}
        >
          Enter BattleFuel <span className="landing-enter-arrow" aria-hidden="true">→</span>
        </button>

        <div className="landing-powered">
          <span className="landing-powered-label">powered by</span>
          <span className="landing-powered-logos">
            <img src="/logos/eraneos_Logo-and-BrandSign-black.png" alt="Eraneos" />
            <img src="/logos/World-Fuel-Services-Logo.png" alt="World Fuel Services" />
          </span>
        </div>
      </main>
    </div>
  )
}
