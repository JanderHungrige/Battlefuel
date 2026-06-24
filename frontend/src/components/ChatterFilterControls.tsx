// Compact control strip for the unified chatter feed (Wave 4 F4 → unify-threat-chatter).
// Controlled: takes the current ChatterFilters + the map-hover toggle and emits changes.

import type { ChatterFilters, ChatterMode } from '../lib/chatterFilter'

const MODES: { value: ChatterMode; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'threat', label: 'Threat' },
  { value: 'supply', label: 'Supply' },
]

export function ChatterFilterControls({
  value,
  onChange,
  hoverDetails,
  onHoverDetailsChange,
}: {
  value: ChatterFilters
  onChange: (next: ChatterFilters) => void
  /** Map-cell hover detail toggle (off = grid number only). */
  hoverDetails: boolean
  onHoverDetailsChange: (next: boolean) => void
}) {
  return (
    <div className="chatter-filters" data-testid="chatter-filters">
      <div className="cf-modes" role="group" aria-label="Chatter filter mode">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            className={`cf-mode${value.mode === m.value ? ' active' : ''}`}
            data-testid={`cf-mode-${m.value}`}
            aria-pressed={value.mode === m.value}
            onClick={() => onChange({ ...value, mode: m.value })}
          >
            {m.label}
          </button>
        ))}
      </div>
      <label className="cf-threshold">
        <span>Threat ≥ {value.minThreat}</span>
        <input
          type="range"
          min={0}
          max={5}
          step={1}
          value={value.minThreat}
          data-testid="cf-threshold"
          onChange={(e) => onChange({ ...value, minThreat: Number(e.target.value) })}
        />
      </label>
      <label className="cf-hover">
        <input
          type="checkbox"
          checked={hoverDetails}
          data-testid="cf-hover-details"
          onChange={(e) => onHoverDetailsChange(e.target.checked)}
        />
        Cell hover details
      </label>
    </div>
  )
}
