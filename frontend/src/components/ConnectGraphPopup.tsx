// Connect-drawn-to-graph popup (v2 Wave 20 F4). Shown after the operator stops drawing a road/path:
// choose which endpoint(s) to connect to the nearest existing graph vertex with a straight line, or
// connect none. The choice is POSTed and the line is injected into the routing graph.

import type { DrawConnect, DrawKind } from '../api/types'

interface ConnectGraphPopupProps {
  kind: DrawKind
  busy?: boolean
  onConnect: (connect: DrawConnect) => void
  onCancel: () => void
}

const CHOICES: { value: DrawConnect; label: string }[] = [
  { value: 'first', label: 'First endpoint' },
  { value: 'last', label: 'Last endpoint' },
  { value: 'both', label: 'Both endpoints' },
  { value: 'none', label: 'None' },
]

export function ConnectGraphPopup({ kind, busy, onConnect, onCancel }: ConnectGraphPopupProps) {
  return (
    <div className="connect-graph-popup" role="dialog" data-testid="connect-graph-popup">
      <div className="connect-graph-title">
        Connect drawn {kind} to the graph
      </div>
      <p className="connect-graph-hint">
        Connect which endpoint(s) to the closest graph point with a straight line? The {kind} then
        becomes part of the routing graph.
      </p>
      <div className="connect-graph-actions">
        {CHOICES.map((c) => (
          <button
            key={c.value}
            type="button"
            className="wp-btn"
            data-testid={`connect-${c.value}`}
            disabled={busy}
            onClick={() => onConnect(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="connect-graph-cancel"
        data-testid="connect-cancel"
        disabled={busy}
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  )
}
