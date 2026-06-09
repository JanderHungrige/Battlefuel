// Planning panel: shows fastest/safest route options for the selected unit and
// confirms a move order. All numeric values come straight from the backend planner.

import type { MoveRefuelOption, RouteMetric, RouteMode, RouteOption } from '../api/types'

interface MoveRoutesPanelProps {
  unitName: string
  loading: boolean
  error: string | null
  options: RouteOption[]
  selectedMetric: RouteMetric | null
  mode: RouteMode
  onSelectMode: (mode: RouteMode) => void
  waypointMode: boolean
  waypointCount: number
  onStartRouting: () => void
  onRemoveLastWaypoint: () => void
  onEndRouting: () => void
  confirming: boolean
  onSelectOption: (metric: RouteMetric) => void
  onConfirm: () => void
  /** Start the refuel-stop option picker (v2 W13). */
  onAddRefuelStop?: () => void
  /** Start a unit-first rendezvous for this unit (pick tanker + sector) (v2 W13). */
  onPlanRendezvous?: () => void
  // Refuel-stop option picker (v2 W13): click through tanker options, confirm one to execute.
  refuelActive?: boolean
  refuelOptions?: MoveRefuelOption[]
  refuelIndex?: number
  refuelBusy?: boolean
  refuelMessage?: string | null
  onRefuelSelect?: (index: number) => void
  onRefuelConfirm?: () => void
  onRefuelCancel?: () => void
  onCancel: () => void
}

const THREAT_WARN = 3 // route options at/above this max threat get a sector warning
const THREAT_COMBAT = 5 // a level-5 (combat) sector — the requester's "over level 4" hard warning

const MODES: { id: RouteMode; label: string }[] = [
  { id: 'road', label: 'Road' },
  { id: 'offroad', label: 'Off-road' },
  { id: 'hybrid', label: 'Hybrid' },
  { id: 'direct', label: 'Direct' },
]

const km = (m: number): string => `${(m / 1000).toFixed(1)} km`
const min = (s: number): string => `${Math.round(s / 60)} min`
const liters = (l: number): string => `${Math.round(l).toLocaleString()} L`

function OptionCard({
  option,
  selected,
  onSelect,
}: {
  option: RouteOption
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`route-option${selected ? ' selected' : ''}`}
      data-testid={`route-option-${option.metric}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="route-option-label">{option.label}</span>
      <span className="route-option-stats">
        <span>{km(option.distance_m)}</span>
        <span>{min(option.duration_s)}</span>
        <span>fuel {liters(option.fuel_consumed_l)}</span>
        <span>left {liters(option.fuel_remaining_l)}</span>
        <span>threat {option.threat_max}</span>
      </span>
      {option.threat_max >= THREAT_COMBAT ? (
        <span
          className="route-option-warning combat"
          data-testid={`route-threat-${option.metric}`}
        >
          ⚠ crosses COMBAT sector (threat {option.threat_max}/5)
        </span>
      ) : option.threat_max >= THREAT_WARN ? (
        <span className="route-option-warning" data-testid={`route-threat-${option.metric}`}>
          ⚠ crosses threat sector ({option.threat_max}/5)
        </span>
      ) : null}
      {!option.sufficient_fuel && (
        <span className="route-option-warning" data-testid={`route-low-fuel-${option.metric}`}>
          ⚠ insufficient fuel
        </span>
      )}
    </button>
  )
}

export function MoveRoutesPanel({
  unitName,
  loading,
  error,
  options,
  selectedMetric,
  mode,
  onSelectMode,
  waypointMode,
  waypointCount,
  onStartRouting,
  onRemoveLastWaypoint,
  onEndRouting,
  confirming,
  onSelectOption,
  onConfirm,
  onAddRefuelStop,
  onPlanRendezvous,
  refuelActive = false,
  refuelOptions = [],
  refuelIndex = 0,
  refuelBusy = false,
  refuelMessage = null,
  onRefuelSelect,
  onRefuelConfirm,
  onRefuelCancel,
  onCancel,
}: MoveRoutesPanelProps) {
  const cur = refuelOptions[refuelIndex]
  return (
    <aside className="move-panel" data-testid="move-panel">
      <button className="inspect-close" onClick={onCancel} aria-label="Close planning">
        ×
      </button>
      <h2>Plan move</h2>
      <div className="move-panel-unit">{unitName}</div>

      <div className="move-mode" role="group" aria-label="Travel mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`move-mode-btn${mode === m.id ? ' selected' : ''}`}
            data-testid={`move-mode-${m.id}`}
            aria-pressed={mode === m.id}
            onClick={() => onSelectMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="move-waypoints">
        {!waypointMode ? (
          <button
            type="button"
            className="wp-btn"
            data-testid="wp-start"
            onClick={onStartRouting}
          >
            Waypoint routing — start
          </button>
        ) : (
          <>
            <span className="wp-hint" data-testid="wp-count">
              Click the map to add waypoints ({waypointCount})
            </span>
            <div className="wp-actions">
              <button
                type="button"
                className="wp-btn"
                data-testid="wp-remove"
                disabled={waypointCount === 0}
                onClick={onRemoveLastWaypoint}
              >
                Remove last waypoint
              </button>
              <button
                type="button"
                className="wp-btn"
                data-testid="wp-end"
                disabled={waypointCount === 0}
                onClick={onEndRouting}
              >
                End routing
              </button>
            </div>
          </>
        )}
      </div>

      {loading && <div className="status">Planning route…</div>}
      {error && <div className="status error" data-testid="move-error">{error}</div>}

      {!loading && !error && options.length === 0 && (
        <div className="move-hint">Click a destination on the map.</div>
      )}

      {options.map((o) => (
        <OptionCard
          key={o.metric}
          option={o}
          selected={o.metric === selectedMetric}
          onSelect={() => onSelectOption(o.metric)}
        />
      ))}

      {options.length > 0 && (
        <button
          type="button"
          className="move-confirm"
          data-testid="confirm-move"
          disabled={selectedMetric === null || confirming}
          onClick={onConfirm}
        >
          {confirming ? 'Confirming…' : 'Confirm move order'}
        </button>
      )}

      {options.length > 0 && !refuelActive && (
        <div className="move-refuel-actions">
          {onAddRefuelStop && (
            <button
              type="button"
              className="move-add-refuel"
              data-testid="add-refuel-stop"
              disabled={selectedMetric === null || confirming}
              onClick={onAddRefuelStop}
              title="Pick a tanker to refuel from on the way"
            >
              + Add refuel stop
            </button>
          )}
          {onPlanRendezvous && (
            <button
              type="button"
              className="move-plan-rdv"
              data-testid="plan-rendezvous"
              disabled={confirming}
              onClick={onPlanRendezvous}
              title="Plan a rendezvous: meet a tanker at a sector"
            >
              Plan rendezvous
            </button>
          )}
        </div>
      )}

      {refuelActive && (
        <div className="refuel-picker" data-testid="refuel-picker">
          {cur ? (
            <>
              <div className="refuel-picker-head">
                Refuel via <strong data-testid="refuel-truck-name">{cur.truck_name}</strong>{' '}
                ({refuelIndex + 1}/{refuelOptions.length})
              </div>
              <div className="refuel-picker-meta">
                unit {Math.round(cur.unit_fuel_l)} L · tanker {Math.round(cur.tanker_fuel_l)} L · threat{' '}
                {cur.threat_max}
              </div>
              <div className="refuel-picker-nav">
                <button
                  type="button"
                  data-testid="refuel-prev"
                  disabled={refuelIndex === 0}
                  onClick={() => onRefuelSelect?.(refuelIndex - 1)}
                >
                  ‹ Prev
                </button>
                <button
                  type="button"
                  data-testid="refuel-next"
                  disabled={refuelIndex >= refuelOptions.length - 1}
                  onClick={() => onRefuelSelect?.(refuelIndex + 1)}
                >
                  Next ›
                </button>
              </div>
              <button
                type="button"
                className="move-confirm"
                data-testid="refuel-confirm"
                disabled={refuelBusy}
                onClick={onRefuelConfirm}
              >
                {refuelBusy ? 'Confirming…' : 'Confirm move order'}
              </button>
            </>
          ) : (
            <div className="move-hint" data-testid="refuel-empty">
              {refuelBusy ? 'Finding tankers…' : (refuelMessage ?? 'No tanker available.')}
            </div>
          )}
          <button
            type="button"
            className="ghost"
            data-testid="refuel-cancel"
            onClick={onRefuelCancel}
          >
            Cancel refuel stop
          </button>
          {cur && refuelMessage && <div className="supply-msg">{refuelMessage}</div>}
        </div>
      )}
    </aside>
  )
}
