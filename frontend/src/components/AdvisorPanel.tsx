// Advisor panel (Wave 6 advisor-ui): request advice, select a recommendation to mark it on the
// map, and apply applyable ones.

import { useState } from 'react'
import type { AdviceResult, Recommendation, RecommendationKind } from '../api/types'

const KINDS: { kind: RecommendationKind; label: string; needsRoute?: boolean }[] = [
  { kind: 'reposition', label: 'Reposition' },
  { kind: 'refuel', label: 'Refuel plan' },
  { kind: 'redistribution', label: 'Redistribution' },
  { kind: 'route', label: 'Route advice', needsRoute: true },
]

export interface AdvisorPanelProps {
  result: AdviceResult | null
  loading: boolean
  error: string | null
  busy: boolean
  canRoute: boolean
  onRequest: (kind: RecommendationKind) => void
  onApply: (rec: Recommendation) => void
  onSelect: (rec: Recommendation | null) => void
  onClose: () => void
}

function applyable(rec: Recommendation): boolean {
  return typeof rec.action.endpoint === 'string'
}

export function AdvisorPanel({
  result,
  loading,
  error,
  busy,
  canRoute,
  onRequest,
  onApply,
  onSelect,
  onClose,
}: AdvisorPanelProps) {
  const [selected, setSelected] = useState<number | null>(null)

  const request = (kind: RecommendationKind): void => {
    setSelected(null)
    onSelect(null)
    onRequest(kind)
  }

  const select = (rec: Recommendation, i: number): void => {
    const next = selected === i ? null : i
    setSelected(next)
    onSelect(next === null ? null : rec)
  }

  return (
    <aside className="advisor-panel" data-testid="advisor-panel">
      <header className="advisor-head">
        <h2>Advisor</h2>
        <button type="button" className="ghost" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <div className="advisor-actions">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            data-testid={`advice-${k.kind}`}
            disabled={loading || (k.needsRoute ? !canRoute : false)}
            onClick={() => request(k.kind)}
          >
            {k.label}
          </button>
        ))}
      </div>

      {loading && <div className="advisor-msg">Computing…</div>}
      {error && <div className="advisor-msg error">{error}</div>}
      {result && !loading && (
        <div className="advisor-results">
          {result.summary && <div className="advisor-summary">{result.summary}</div>}
          {result.recommendations.length === 0 && (
            <div className="advisor-msg">No recommendations.</div>
          )}
          {result.recommendations.map((rec, i) => (
            <div
              key={i}
              className={`advice-rec${selected === i ? ' selected' : ''}`}
              data-testid="advice-rec"
            >
              <button
                type="button"
                className="advice-rationale"
                data-testid="advice-select"
                onClick={() => select(rec, i)}
              >
                {rec.rationale}
              </button>
              {applyable(rec) && (
                <button
                  type="button"
                  data-testid="advice-apply"
                  disabled={busy}
                  onClick={() => onApply(rec)}
                >
                  Apply
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}
