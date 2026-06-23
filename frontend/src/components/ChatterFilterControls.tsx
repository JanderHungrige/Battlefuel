// Compact control strip for the chatter feed + map combat squares (v2 Wave 4 F4).
// Controlled component: takes the current ChatterFilters and emits the next one via onChange.

import type { ChatterFilters, ChatterMode } from '../lib/chatterFilter'
import type { CombatEventZone } from '../api/types'

const MODES: { value: ChatterMode; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'threat', label: 'Threat' },
  { value: 'supply', label: 'Supply' },
]

const ZONES: { value: CombatEventZone; label: string }[] = [
  { value: 'combat', label: 'Combat' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'threat', label: 'Threat' },
]

export function ChatterFilterControls({
  value,
  onChange,
}: {
  value: ChatterFilters
  onChange: (next: ChatterFilters) => void
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
      <div className="cf-zones" role="group" aria-label="Map square zones">
        {ZONES.map((z) => (
          <label key={z.value} className={`cf-zone cf-zone-${z.value}`}>
            <input
              type="checkbox"
              checked={value.zones[z.value]}
              data-testid={`cf-zone-${z.value}`}
              onChange={(e) =>
                onChange({ ...value, zones: { ...value.zones, [z.value]: e.target.checked } })
              }
            />
            {z.label}
          </label>
        ))}
      </div>
    </div>
  )
}
