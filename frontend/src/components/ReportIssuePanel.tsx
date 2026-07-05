// "Report a bug / suggestion" panel (doc 129). An in-app modal overlay: headline, type
// (bug/suggestion), OF-scope, description, optional severity (bugs) and contact, plus Send/Cancel.
// On send it posts to /report-issue, which opens a GitHub issue server-side. The form→request
// assembly + context capture live in ../lib/reportIssue (unit-tested); this component is the UI.

import { useState } from 'react'
import { api } from '../api/client'
import type { IssueKind, IssueScope, IssueSeverity } from '../api/types'
import type { Role } from '../roles'
import {
  EMPTY_REPORT,
  type ReportForm,
  buildReportRequest,
  captureContext,
  isReportValid,
} from '../lib/reportIssue'
import './ReportIssuePanel.css'

interface ReportIssuePanelProps {
  role: Role
  /** Short label for the current view, appended to the issue context (e.g. "supply"). */
  view: string
  onClose: () => void
}

type Status =
  | { state: 'idle' }
  | { state: 'sending' }
  | { state: 'sent'; number: number; url: string }
  | { state: 'error'; message: string }

const SCOPES: { value: IssueScope; label: string }[] = [
  { value: 'of4', label: 'OF-4 (tactical)' },
  { value: 'of8', label: 'OF-8 (supply)' },
  { value: 'both', label: 'Both' },
]
const SEVERITIES: IssueSeverity[] = ['minor', 'major', 'blocker']

export function ReportIssuePanel({ role, view, onClose }: ReportIssuePanelProps) {
  const [form, setForm] = useState<ReportForm>(EMPTY_REPORT)
  const [hp, setHp] = useState('') // honeypot — hidden from real users
  const [status, setStatus] = useState<Status>({ state: 'idle' })

  const set = <K extends keyof ReportForm>(key: K, value: ReportForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const canSend = isReportValid(form) && status.state !== 'sending'

  const submit = async () => {
    if (!canSend) return
    setStatus({ state: 'sending' })
    try {
      const req = buildReportRequest(form, captureContext(role, view), hp)
      const res = await api.reportIssue(req)
      setStatus({ state: 'sent', number: res.number, url: res.url })
    } catch {
      setStatus({
        state: 'error',
        message: 'Could not send the report. Please try again in a moment.',
      })
    }
  }

  return (
    <div className="report-overlay" role="dialog" aria-modal="true" aria-label="Report a bug or suggestion">
      <div className="report-panel" data-testid="report-panel">
        <button className="inspect-close" onClick={onClose} aria-label="Close report">
          ×
        </button>
        <h2 className="report-title-h">Report a bug or suggestion</h2>

        {status.state === 'sent' ? (
          <div className="report-sent" data-testid="report-sent">
            <p>✅ Thanks — your {form.kind === 'bug' ? 'bug report' : 'suggestion'} was filed.</p>
            <button className="wp-btn" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <>
            <label className="report-field">
              <span>Headline</span>
              <input
                data-testid="report-headline"
                type="text"
                maxLength={120}
                value={form.title}
                placeholder="Short summary"
                onChange={(e) => set('title', e.target.value)}
              />
            </label>

            <div className="report-row">
              <label className="report-field">
                <span>Type</span>
                <select
                  data-testid="report-kind"
                  value={form.kind}
                  onChange={(e) => set('kind', e.target.value as IssueKind)}
                >
                  <option value="bug">Bug</option>
                  <option value="suggestion">Suggestion</option>
                </select>
              </label>

              <label className="report-field">
                <span>Area</span>
                <select
                  data-testid="report-scope"
                  value={form.scope}
                  onChange={(e) => set('scope', e.target.value as IssueScope)}
                >
                  {SCOPES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>

              {form.kind === 'bug' && (
                <label className="report-field">
                  <span>Severity</span>
                  <select
                    data-testid="report-severity"
                    value={form.severity}
                    onChange={(e) => set('severity', e.target.value as IssueSeverity | '')}
                  >
                    <option value="">—</option>
                    {SEVERITIES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <label className="report-field">
              <span>{form.kind === 'bug' ? 'What happened?' : 'Your idea'}</span>
              <textarea
                data-testid="report-description"
                rows={5}
                maxLength={5000}
                value={form.description}
                placeholder={
                  form.kind === 'bug'
                    ? 'Steps, what you expected, what happened instead…'
                    : 'Describe the improvement…'
                }
                onChange={(e) => set('description', e.target.value)}
              />
            </label>

            <label className="report-field">
              <span>Contact (optional)</span>
              <input
                data-testid="report-contact"
                type="text"
                maxLength={120}
                value={form.contact}
                placeholder="Name or email, if you want a reply"
                onChange={(e) => set('contact', e.target.value)}
              />
            </label>

            {/* Honeypot: off-screen, not tab-reachable. Bots fill it; the backend drops those. */}
            <input
              className="report-hp"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={hp}
              onChange={(e) => setHp(e.target.value)}
            />

            {status.state === 'error' && (
              <p className="report-error" data-testid="report-error">
                {status.message}
              </p>
            )}

            <div className="report-actions">
              <button className="wp-btn" data-testid="report-cancel" onClick={onClose}>
                Cancel
              </button>
              <button
                className="wp-btn report-send"
                data-testid="report-send"
                disabled={!canSend}
                onClick={submit}
              >
                {status.state === 'sending' ? 'Sending…' : 'Send'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
