// Banner shown when a unit halts at an obstruction (v2 Wave 10 F1/F4). Offers the operator the
// two follow-ups from the halt model: "Proceed slowly" (crawl across) or "Re-route" (plan anew).

import type { HaltedUnit } from '../lib/halt'

interface HaltBannerProps {
  halted: HaltedUnit
  unitName: string
  proceeding: boolean
  onProceed: () => void
  onReroute: () => void
  onDismiss: () => void
}

export function HaltBanner({
  halted,
  unitName,
  proceeding,
  onProceed,
  onReroute,
  onDismiss,
}: HaltBannerProps) {
  const what = halted.reason === 'threat' ? 'a threat (L5) sector' : 'a blocked tile'
  return (
    <div className="halt-banner" role="alert" data-testid="halt-banner">
      <span className="halt-banner-text">
        ⚠ {unitName} halted at {what} ({halted.lat.toFixed(4)}, {halted.lon.toFixed(4)}).
      </span>
      <div className="halt-banner-actions">
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
