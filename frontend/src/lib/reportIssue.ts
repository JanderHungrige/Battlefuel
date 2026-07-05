// Pure helpers for the "Report a bug / suggestion" panel (doc 129).
//
// The panel is presentational; the form→request assembly and the client-context capture live here
// so they are unit-testable without the DOM. `buildReportRequest` mirrors the backend rules:
// severity is dropped for suggestions, and blank optional fields become null.

import type {
  IssueContext,
  IssueKind,
  IssueScope,
  IssueSeverity,
  ReportIssueRequest,
} from '../api/types'

export interface ReportForm {
  title: string
  kind: IssueKind
  scope: IssueScope
  description: string
  /** '' means "not chosen"; only meaningful when kind === 'bug'. */
  severity: IssueSeverity | ''
  contact: string
}

export const EMPTY_REPORT: ReportForm = {
  title: '',
  kind: 'bug',
  scope: 'both',
  description: '',
  severity: '',
  contact: '',
}

/** A report can be sent once it has a headline and a description. */
export function isReportValid(form: ReportForm): boolean {
  return form.title.trim().length > 0 && form.description.trim().length > 0
}

/** Capture advisory context about the current session (role, view, browser, app version). */
export function captureContext(role: string, view: string): IssueContext {
  const version =
    (import.meta.env.VITE_APP_VERSION as string | undefined)?.trim() || 'unknown'
  return {
    app_version: version,
    role,
    view,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  }
}

/** Assemble the POST /report-issue payload from the form + captured context. */
export function buildReportRequest(
  form: ReportForm,
  context: IssueContext,
  hp = '',
): ReportIssueRequest {
  return {
    title: form.title.trim(),
    kind: form.kind,
    scope: form.scope,
    description: form.description.trim(),
    // Severity only applies to bugs; a suggestion (or an unset choice) sends null.
    severity: form.kind === 'bug' && form.severity !== '' ? form.severity : null,
    contact: form.contact.trim() || null,
    context,
    hp,
  }
}
