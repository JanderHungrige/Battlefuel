// Batch threat-set panel for a multi-cell selection (v2 Wave 22 F4, multi-tile-threat-select).
// Shown while ≥1 cell is Shift/Ctrl-selected; the 0–5 buttons set that threat on every H3 tile in
// the selection at once. Mirrors the move/draw panel styling (move-panel / wp-btn).

import { useState } from 'react'

interface MultiCellThreatPanelProps {
  count: number
  onSetThreat: (level: number) => void
  onClear: () => void
}

const THREAT_LEVELS = [0, 1, 2, 3, 4, 5]

export function MultiCellThreatPanel({ count, onSetThreat, onClear }: MultiCellThreatPanelProps) {
  // Mark the level last applied to the selection so the click is visibly acknowledged. Resets when
  // the panel unmounts (the selection is cleared).
  const [lastSet, setLastSet] = useState<number | null>(null)
  return (
    <aside className="move-panel multi-cell-panel" data-testid="multi-cell-panel">
      <button className="inspect-close" onClick={onClear} aria-label="Clear cell selection">
        ×
      </button>
      <div className="move-panel-unit" data-testid="multi-cell-count">
        {count} cell{count === 1 ? '' : 's'} selected
      </div>
      <div className="wp-hint">Shift/Ctrl-click cells to add. Set threat level for all:</div>
      <div className="multi-threat-row">
        {THREAT_LEVELS.map((n) => (
          <button
            key={n}
            type="button"
            className={`wp-btn threat-btn${lastSet === n ? ' threat-set' : ''}`}
            data-testid={`multi-threat-${n}`}
            aria-pressed={lastSet === n}
            onClick={() => {
              setLastSet(n)
              onSetThreat(n)
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </aside>
  )
}
