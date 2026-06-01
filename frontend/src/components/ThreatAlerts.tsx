// Small pop-up info fields for incoming threat events (Wave 4 threat-planning-ui).
// Shows the most recent threat tile_updates; the list is capped upstream (useSimSocket).

import type { TileAlert } from '../api/types'

function shortCell(h3: string): string {
  return h3.length > 8 ? `${h3.slice(0, 6)}…` : h3
}

export function ThreatAlerts({ alerts }: { alerts: TileAlert[] }) {
  if (alerts.length === 0) return null
  return (
    <div className="threat-alerts" data-testid="threat-alerts">
      {[...alerts].reverse().map((a) => (
        <div key={a.id} className="threat-alert" data-testid="threat-alert">
          <span className="threat-alert-badge">⚠ {a.threat_level}/5</span>
          <span className="threat-alert-text">
            Threat in {a.terrain} sector {shortCell(a.h3_index)}
          </span>
        </div>
      ))}
    </div>
  )
}
