// Advisor panel (Wave 6 advisor-ui): request advice and apply recommendations.

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
  onClose,
}: AdvisorPanelProps) {
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
            onClick={() => onRequest(k.kind)}
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
            <div key={i} className="advice-rec" data-testid="advice-rec">
              <span className="advice-rationale">{rec.rationale}</span>
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
