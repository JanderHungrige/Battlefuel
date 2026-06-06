// Fuel-run panel (v2 Wave 12 F1): shows the mover → target, the Safe/Fast route options to
// choose from, and Confirm/Cancel. Driven by useFuelRun.

import type { RouteMetric, RouteOption } from '../api/types'

export interface FuelRunPanelProps {
  phase: 'idle' | 'pick-target' | 'review'
  moverName: string
  targetName: string
  options: RouteOption[]
  metric: RouteMetric | null
  busy: boolean
  message: string | null
  onSelectMetric: (m: RouteMetric) => void
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
  onSelectMetric,
  onConfirm,
  onCancel,
}: FuelRunPanelProps) {
  if (phase === 'idle') return null
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

      {phase === 'review' && (
        <button
          type="button"
          className="fuel-run-confirm"
          data-testid="fuel-run-confirm"
          disabled={busy || !metric || options.length === 0}
          onClick={onConfirm}
        >
          Confirm fuel run
        </button>
      )}

      {message && <div className="supply-msg">{message}</div>}
    </aside>
  )
}
