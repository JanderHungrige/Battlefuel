// Selected-drawn-edge panel (v2 Wave 20 F6). Shown while a drawn road/path is selected in Edit-graph
// mode: its kind + a Remove action that deletes it from the routing graph, or Cancel to deselect.

import type { DrawKind } from '../api/types'

interface DrawnEdgeEditPanelProps {
  kind: DrawKind
  busy?: boolean
  onRemove: () => void
  onCancel: () => void
}

export function DrawnEdgeEditPanel({ kind, busy, onRemove, onCancel }: DrawnEdgeEditPanelProps) {
  return (
    <aside className="move-panel draw-graph-panel" data-testid="drawn-edge-edit-panel">
      <button className="inspect-close" onClick={onCancel} aria-label="Deselect">
        ×
      </button>
      <div className="move-panel-unit">Selected drawn {kind}</div>
      <div className="move-waypoints">
        <span className="wp-hint">Remove this {kind} from the routing graph?</span>
        <div className="wp-actions">
          <button
            type="button"
            className="wp-btn draw-remove-btn"
            data-testid="drawn-edge-remove"
            disabled={busy}
            onClick={onRemove}
          >
            {busy ? 'Removing…' : 'Remove'}
          </button>
          <button
            type="button"
            className="wp-btn"
            data-testid="drawn-edge-deselect"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </aside>
  )
}
