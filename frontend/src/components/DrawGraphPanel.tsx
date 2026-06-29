// Active-draw panel (v2 Wave 20 F3, draw-road-path-tool). Shown while the operator is drawing a
// road (solid) or path (dotted): the kind label + waypoint count, and the Remove-last-waypoint /
// Stop controls. Mirrors the Move panel's waypoint UX (wp-btn / wp-actions classes).

import type { DrawKind } from '../hooks/useDrawGraph'

interface DrawGraphPanelProps {
  kind: DrawKind
  count: number
  onRemoveLast: () => void
  onStop: () => void
  onCancel: () => void
}

export function DrawGraphPanel({ kind, count, onRemoveLast, onStop, onCancel }: DrawGraphPanelProps) {
  const label = kind === 'road' ? 'road' : 'path'
  return (
    <aside className="move-panel draw-graph-panel" data-testid="draw-graph-panel">
      <button className="inspect-close" onClick={onCancel} aria-label="Cancel drawing">
        ×
      </button>
      <div className="move-panel-unit">
        Drawing {label} {kind === 'road' ? '(solid)' : '(dotted)'}
      </div>
      <div className="move-waypoints">
        <span className="wp-hint" data-testid="draw-count">
          Click the map to add waypoints ({count})
        </span>
        <div className="wp-actions">
          <button
            type="button"
            className="wp-btn"
            data-testid="draw-remove"
            disabled={count === 0}
            onClick={onRemoveLast}
          >
            Remove last waypoint
          </button>
          <button
            type="button"
            className="wp-btn"
            data-testid="draw-stop"
            disabled={count < 2}
            onClick={onStop}
          >
            Stop draw {label}
          </button>
        </div>
      </div>
    </aside>
  )
}
