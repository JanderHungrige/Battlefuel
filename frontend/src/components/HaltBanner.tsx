// Banner shown when a unit halts at an obstruction (v2 Wave 10 F1/F4). Offers the operator the
// two follow-ups from the halt model: "Proceed slowly" (crawl across) or "Re-route" (plan anew).

import type { HaltedUnit } from '../lib/halt'

interface HaltBannerProps {
  halted: HaltedUnit
  unitName: string
  proceeding: boolean
  onProceed: () => void
  onContinue: () => void
  onReroute: () => void
  onDismiss: () => void
}

export function HaltBanner({
  halted,
  unitName,
  proceeding,
  onProceed,
  onContinue,
  onReroute,
  onDismiss,
}: HaltBannerProps) {
  const isThreat = halted.reason === 'threat'
  const what = isThreat ? 'a threat (L5) sector' : 'a blocked tile'
  // Slow-mode fuel estimate for the remaining threat tiles (v2 W13 F5).
  const slowFuel = halted.slowModeFuelL
  return (
    <div className="halt-banner" role="alert" data-testid="halt-banner">
      <span className="halt-banner-text">
        ⚠ {unitName} halted at {what} ({halted.lat.toFixed(4)}, {halted.lon.toFixed(4)}).
        {slowFuel !== undefined && slowFuel > 0 && (
          <span className="halt-slow-fuel" data-testid="halt-slow-fuel">
            {' '}
            Slow mode ≈ {Math.round(slowFuel)} L over the remaining threat tiles.
          </span>
        )}
      </span>
      <div className="halt-banner-actions">
        {/* Continue at normal speed — only meaningful for a threat sector, not a physical block. */}
        {isThreat && (
          <button type="button" data-testid="halt-continue" disabled={proceeding} onClick={onContinue}>
            Continue
          </button>
        )}
        <button type="button" data-testid="halt-proceed" disabled={proceeding} onClick={onProceed}>
          {proceeding ? 'Proceeding…' : 'Proceed slowly'}
        </button>
        <button type="button" data-testid="halt-reroute" onClick={onReroute}>
          Re-route
        </button>
        <button type="button" className="halt-dismiss" aria-label="Dismiss" onClick={onDismiss}>
          ×
        </button>
      </div>
    </div>
  )
}
