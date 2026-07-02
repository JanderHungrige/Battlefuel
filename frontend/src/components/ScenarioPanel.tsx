// Scenario save/load panel (v2 Wave 22 F5, scenario-save-load). Save the current hand-built state
// under a name, or reload / delete a saved one. Mirrors the move/draw panel styling.

import { useState } from 'react'
import type { ScenarioSummary } from '../api/types'

interface ScenarioPanelProps {
  scenarios: ScenarioSummary[]
  onSave: (name: string) => void
  onLoad: (id: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}

export function ScenarioPanel({ scenarios, onSave, onLoad, onDelete, onClose }: ScenarioPanelProps) {
  const [name, setName] = useState('')
  const trimmed = name.trim()
  return (
    <aside className="move-panel scenario-panel" data-testid="scenario-panel">
      <button className="inspect-close" onClick={onClose} aria-label="Close scenarios">
        ×
      </button>
      <div className="move-panel-unit">Scenarios</div>

      <div className="scenario-save">
        <input
          className="scenario-name"
          data-testid="scenario-name"
          placeholder="Scenario name…"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="button"
          className="wp-btn"
          data-testid="scenario-save"
          disabled={trimmed.length === 0}
          onClick={() => {
            onSave(trimmed)
            setName('')
          }}
        >
          Save current
        </button>
      </div>

      <div className="wp-hint">Saved scenarios:</div>
      {scenarios.length === 0 ? (
        <div className="scenario-empty" data-testid="scenario-empty">
          None saved yet.
        </div>
      ) : (
        <ul className="scenario-list" data-testid="scenario-list">
          {scenarios.map((s) => (
            <li key={s.id} className="scenario-row">
              <span className="scenario-row-name" title={s.name}>
                {s.name}
              </span>
              <button
                type="button"
                className="wp-btn"
                data-testid={`scenario-load-${s.id}`}
                onClick={() => onLoad(s.id)}
              >
                Load
              </button>
              <button
                type="button"
                className="wp-btn scenario-del"
                data-testid={`scenario-delete-${s.id}`}
                aria-label={`Delete ${s.name}`}
                onClick={() => onDelete(s.id)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
