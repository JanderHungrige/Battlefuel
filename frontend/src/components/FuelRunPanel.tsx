// Fuel-run panel (v2 Wave 12 F1): shows the mover → target, the Safe/Fast route options to
// choose from, and Confirm/Cancel. Driven by useFuelRun.

import type { RouteMetric, RouteOption } from '../api/types'
import { needsForceProtection } from '../lib/forceProtection'

export interface FuelRunPanelProps {
  phase: 'idle' | 'pick-target' | 'review'
  moverName: string
  targetName: string
  options: RouteOption[]
  metric: RouteMetric | null
  busy: boolean
  message: string | null
  /** Unit-first source: 'truck' (tanker → unit) or 'depot' (unit → depot); null for truck-first. */
  sourceKind: 'truck' | 'depot' | null
  /** Offered tanker name ('' = none available). */
  truckSourceName: string
  /** Offered depot name ('' = none available). */
  depotSourceName: string
  onSelectMetric: (m: RouteMetric) => void
  onSelectSource: (kind: 'truck' | 'depot') => void
  onConfirm: () => void
  onCancel: () => void
}

const km = (m: number): string => `${(m / 1000).toFixed(1)} km`
const mins = (s: number): string => `${Math.round(s / 60)} min`

export function FuelRunPanel({
  phase,
  moverName,
  targetName,
  options,
  metric,
  busy,
  message,
  sourceKind,
  truckSourceName,
  depotSourceName,
  onSelectMetric,
  onSelectSource,
  onConfirm,
  onCancel,
}: FuelRunPanelProps) {
  if (phase === 'idle') return null
  // Offer the source choice whenever a unit-first run has both a tanker and a depot available.
  const showSourceToggle = phase === 'review' && truckSourceName !== '' && depotSourceName !== ''
  // Force protection (v2 W13 F7): the chosen route routes a tanker through threat tiles.
  const selected = options.find((o) => o.metric === metric)
  const forceProtection = phase === 'review' && needsForceProtection(selected?.threat_max)
  return (
    <aside className="fuel-run-panel" data-testid="fuel-run-panel">
      <div className="fuel-run-head">
        <h2>Fuel run</h2>
        <button type="button" className="ghost" data-testid="fuel-run-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <p className="fuel-run-route">
        <strong>{moverName || '—'}</strong> → <strong>{targetName || '(pick a unit)'}</strong>
      </p>

      {showSourceToggle && (
        <div className="fuel-run-sources" data-testid="fuel-run-sources">
          <button
            type="button"
            className={`fuel-run-source ${sourceKind === 'truck' ? 'active' : ''}`}
            data-testid="fuel-run-source-truck"
            disabled={busy}
            onClick={() => onSelectSource('truck')}
          >
            {truckSourceName} → unit
          </button>
          <button
            type="button"
            className={`fuel-run-source ${sourceKind === 'depot' ? 'active' : ''}`}
            data-testid="fuel-run-source-depot"
            disabled={busy}
            onClick={() => onSelectSource('depot')}
          >
            unit → {depotSourceName}
          </button>
        </div>
      )}

      {phase === 'pick-target' && (
        <p className="fuel-run-hint" data-testid="fuel-run-hint">
          Click the unit to refuel on the map.
        </p>
      )}

      {phase === 'review' && options.length > 0 && (
        <ul className="fuel-run-options" data-testid="fuel-run-options">
          {options.map((o) => (
            <li key={o.metric}>
              <button
                type="button"
                className={`fuel-run-option ${o.metric === metric ? 'active' : ''}`}
                data-testid={`fuel-run-option-${o.metric}`}
                onClick={() => onSelectMetric(o.metric)}
              >
                <span className="fuel-run-option-label">{o.metric === 'safe' ? 'Safe' : 'Fast'}</span>
                <span className="fuel-run-option-meta">
                  {km(o.distance_m)} · {mins(o.duration_s)} · {Math.round(o.fuel_consumed_l)} L · threat {o.threat_max}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {forceProtection && (
        <p className="fuel-run-force-protection" data-testid="fuel-run-force-protection">
          ⚠ Route crosses a threat sector — force protection should be considered.
        </p>
      )}

      {phase === 'review' && (
        <button
          type="button"
          className="fuel-run-confirm"
          data-testid="fuel-run-confirm"
          disabled={busy || !metric || options.length === 0}
          onClick={onConfirm}
        >
          {forceProtection ? 'Confirm fuel run with force protection' : 'Confirm fuel run'}
        </button>
      )}

      {message && <div className="supply-msg">{message}</div>}
    </aside>
  )
}
