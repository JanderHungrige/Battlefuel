// Scenario creator force-placement panel (v2 Wave 22 F1, scenario-force-placement). Pick a side
// (blue / red), a tab (fuel-related vs other troop elements), and a unit type from the dropdown;
// then click the map to place it. Mirrors the move/draw panel styling (move-panel / wp-btn).

import type { UnitType } from '../api/types'
import { type ForceTab, unitsForTab } from '../lib/forceCatalog'
import { FRIENDLY_SYMBOL, HOSTILE_SYMBOL } from '../map/colors'

export type ForceSide = 'blue' | 'red'

interface ForcePlacementPanelProps {
  unitTypes: UnitType[]
  side: ForceSide
  onSide: (side: ForceSide) => void
  tab: ForceTab
  onTab: (tab: ForceTab) => void
  selectedTypeId: string | null
  onSelectType: (id: string) => void
  onClose: () => void
}

export function ForcePlacementPanel({
  unitTypes,
  side,
  onSide,
  tab,
  onTab,
  selectedTypeId,
  onSelectType,
  onClose,
}: ForcePlacementPanelProps) {
  const options = unitsForTab(unitTypes, tab)
  const selected = unitTypes.find((u) => u.id === selectedTypeId) ?? null
  return (
    <aside className="move-panel force-placement-panel" data-testid="force-placement-panel">
      <button className="inspect-close" onClick={onClose} aria-label="Close force placement">
        ×
      </button>
      <div className="move-panel-unit">Place forces</div>

      <div className="force-side-toggle" role="group" aria-label="Force side">
        <button
          type="button"
          className={`wp-btn${side === 'blue' ? ' active' : ''}`}
          data-testid="force-side-blue"
          onClick={() => onSide('blue')}
        >
          <span className="force-swatch" style={{ background: FRIENDLY_SYMBOL }} /> Blue
        </button>
        <button
          type="button"
          className={`wp-btn${side === 'red' ? ' active' : ''}`}
          data-testid="force-side-red"
          onClick={() => onSide('red')}
        >
          <span className="force-swatch" style={{ background: HOSTILE_SYMBOL }} /> Red
        </button>
      </div>

      <div className="force-tabs" role="tablist" aria-label="Unit category">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'fuel'}
          className={`wp-btn${tab === 'fuel' ? ' active' : ''}`}
          data-testid="force-tab-fuel"
          onClick={() => onTab('fuel')}
        >
          Fuel elements
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'troops'}
          className={`wp-btn${tab === 'troops' ? ' active' : ''}`}
          data-testid="force-tab-troops"
          onClick={() => onTab('troops')}
        >
          Other troops
        </button>
      </div>

      <select
        className="force-type-select"
        data-testid="force-type-select"
        value={options.some((o) => o.id === selectedTypeId) ? (selectedTypeId ?? '') : ''}
        onChange={(e) => onSelectType(e.target.value)}
      >
        <option value="" disabled>
          Choose a unit type…
        </option>
        {options.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} ({u.echelon})
          </option>
        ))}
      </select>

      <div className="wp-hint" data-testid="force-hint">
        {selected
          ? `Click the map to place a ${side} ${selected.name}.`
          : 'Pick a unit type, then click the map to place it.'}
      </div>
    </aside>
  )
}
