// Plan-rendezvous panel (v2 Wave 13 F3): pick unit + sector, preview both movers' Safe/Fast
// routes with fuel-to-meet, then Order now or schedule for a sim-time delay. Driven by
// usePlanRendezvous. Mirrors FuelRunPanel (v2 Wave 12).

import { useState } from 'react'
import type { RouteMetric, RouteOption } from '../api/types'
import { needsForceProtection } from '../lib/forceProtection'

export interface PlanRendezvousPanelProps {
  phase: 'idle' | 'pick-truck' | 'pick-unit' | 'pick-sector' | 'review'
  truckName: string
  unitName: string
  truckRoutes: RouteOption[]
  unitRoutes: RouteOption[]
  metric: RouteMetric | null
  busy: boolean
  message: string | null
  onSelectMetric: (m: RouteMetric) => void
  onOrderNow: () => void
  onSchedule: (scheduledGameS: number) => void
  onCancel: () => void
}

const km = (m: number): string => `${(m / 1000).toFixed(1)} km`
const mins = (s: number): string => `${Math.round(s / 60)} min`
const optFor = (routes: RouteOption[], metric: RouteMetric | null): RouteOption | undefined =>
  routes.find((o) => o.metric === metric)

function MoverRow({ label, opt }: { label: string; opt: RouteOption | undefined }) {
  return (
    <li className="rdv-mover" data-testid={`rdv-mover-${label.toLowerCase()}`}>
      <span className="rdv-mover-label">{label}</span>
      {opt ? (
        <span className="rdv-mover-meta">
          {km(opt.distance_m)} · {mins(opt.duration_s)} · fuel-to-meet{' '}
          <strong>{Math.round(opt.fuel_consumed_l)} L</strong> · threat {opt.threat_max}
        </span>
      ) : (
        <span className="rdv-mover-meta">—</span>
      )}
    </li>
  )
}

export function PlanRendezvousPanel({
  phase,
  truckName,
  unitName,
  truckRoutes,
  unitRoutes,
  metric,
  busy,
  message,
  onSelectMetric,
  onOrderNow,
  onSchedule,
  onCancel,
}: PlanRendezvousPanelProps) {
  const [scheduling, setScheduling] = useState(false)
  const [hours, setHours] = useState(0)
  const [minutes, setMinutes] = useState(10)
  if (phase === 'idle') return null

  const scheduledGameS = hours * 3600 + minutes * 60
  const metrics: RouteMetric[] = ['safe', 'fast']
  // Force protection (v2 W13 F7): the tanker's chosen route crosses threat tiles.
  const forceProtection = phase === 'review' && needsForceProtection(optFor(truckRoutes, metric)?.threat_max)

  return (
    <aside className="fuel-run-panel rendezvous-panel" data-testid="plan-rendezvous-panel">
      <div className="fuel-run-head">
        <h2>Plan rendezvous</h2>
        <button type="button" className="ghost" data-testid="rdv-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <p className="fuel-run-route">
        <strong>{truckName || '(tanker)'}</strong> ↔ <strong>{unitName || '(unit)'}</strong>
      </p>

      {phase === 'pick-truck' && (
        <p className="fuel-run-hint" data-testid="rdv-hint">
          Click the tanker to refuel from on the map.
        </p>
      )}
      {phase === 'pick-unit' && (
        <p className="fuel-run-hint" data-testid="rdv-hint">
          Click the unit to refuel on the map.
        </p>
      )}
      {phase === 'pick-sector' && (
        <p className="fuel-run-hint" data-testid="rdv-hint">
          Click the meeting sector on the map.
        </p>
      )}

      {phase === 'review' && (
        <>
          <ul className="fuel-run-options" data-testid="rdv-metrics">
            {metrics.map((m) => (
              <li key={m}>
                <button
                  type="button"
                  className={`fuel-run-option ${m === metric ? 'active' : ''}`}
                  data-testid={`rdv-metric-${m}`}
                  onClick={() => onSelectMetric(m)}
                >
                  {m === 'safe' ? 'Safe' : 'Fast'}
                </button>
              </li>
            ))}
          </ul>

          <ul className="rdv-movers" data-testid="rdv-movers">
            <MoverRow label="Tanker" opt={optFor(truckRoutes, metric)} />
            <MoverRow label="Unit" opt={optFor(unitRoutes, metric)} />
          </ul>

          {forceProtection && (
            <p className="fuel-run-force-protection" data-testid="rdv-force-protection">
              ⚠ Tanker route crosses a threat sector — force protection should be considered.
            </p>
          )}

          <button
            type="button"
            className="fuel-run-confirm"
            data-testid="rdv-order-now"
            disabled={busy || !metric}
            onClick={onOrderNow}
          >
            {forceProtection ? 'Order now with force protection' : 'Order now'}
          </button>

          {!scheduling ? (
            <button
              type="button"
              className="ghost rdv-plan-toggle"
              data-testid="rdv-plan-toggle"
              disabled={busy}
              onClick={() => setScheduling(true)}
            >
              Plan rendezvous (schedule)
            </button>
          ) : (
            <div className="rdv-schedule" data-testid="rdv-schedule">
              <label>
                in
                <input
                  type="number"
                  min={0}
                  data-testid="rdv-hours"
                  value={hours}
                  onChange={(e) => setHours(Math.max(0, Number(e.target.value) || 0))}
                />
                h
                <input
                  type="number"
                  min={0}
                  data-testid="rdv-minutes"
                  value={minutes}
                  onChange={(e) => setMinutes(Math.max(0, Number(e.target.value) || 0))}
                />
                min (sim)
              </label>
              <button
                type="button"
                className="fuel-run-confirm"
                data-testid="rdv-send"
                disabled={busy || !metric || scheduledGameS <= 0}
                onClick={() => onSchedule(scheduledGameS)}
              >
                {forceProtection ? 'Send order (force protection)' : 'Send order'}
              </button>
            </div>
          )}
        </>
      )}

      {message && <div className="supply-msg">{message}</div>}
    </aside>
  )
}
