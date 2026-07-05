---
id: 129-report-issue
title: Report a Bug / Suggestion — in-app panel that opens a GitHub issue
edition: BattleFuel
depends_on: []
source_files:
  - backend/app/config.py
  - backend/app/services/github_issue.py
  - backend/app/api/report_issue.py
  - backend/app/main.py
  - frontend/src/lib/reportIssue.ts
  - frontend/src/components/ReportIssuePanel.tsx
  - frontend/src/components/ReportIssuePanel.css
  - frontend/src/api/client.ts
  - frontend/src/api/types.ts
  - frontend/src/App.tsx
  - deploy/compose.app.yml
  - .env.example
  - backend/.env.example
routes:
  - POST /api/v1/report-issue
models: []
test_files:
  - backend/tests/test_report_issue.py
  - frontend/src/lib/reportIssue.test.ts
data_flow: greenfield
last_synced: 2026-07-06
status: in_progress
phase: integration-pending
mdd_version: 11
tags: [report-issue, github-issues, feedback, bug-report, server-authoritative, rate-limit]
path: Feedback/Report-Issue
integration_contracts: []
satisfies_contracts: []
known_issues: []
security_read_sites: []
sister_projects: []
---

# 129 — Report a Bug / Suggestion

## Purpose

Let any user file a bug or improvement from inside the app: an in-app panel collects a headline,
a type (bug / suggestion), an OF-scope (OF-4 / OF-8 / both), a description (+ optional severity and
contact), and the backend opens it as a GitHub issue on the public repo. The GitHub token stays
**server-side only** — the browser never sees it.

## Architecture

Server-authoritative, matching the rest of BattleFuel:

```
ReportIssuePanel (frontend) → POST /api/v1/report-issue → github_issue.post_issue()
    → GitHub REST: POST /repos/{repo}/issues  (auth: server-held PAT)
```

- **Frontend** — `ReportIssuePanel.tsx` (in-app overlay, opened by a topbar "Report" button).
  `lib/reportIssue.ts` holds the pure client-context capture + validation (unit-tested); the panel
  is presentational + submit state. `api/client.ts` gains `reportIssue()`.
- **Backend** — `api/report_issue.py` validates + rate-limits + delegates to
  `services/github_issue.py`. `build_issue()` (pure) maps the request to `(title, body, labels)`;
  `post_issue()` performs the GitHub call using the Python **stdlib `urllib`** (prod image installs
  runtime deps only — no httpx at runtime), run in a threadpool so the endpoint stays async.
- **Config** — token + repo come from the environment (`BATTLEFUEL_GITHUB_ISSUE_TOKEN`,
  `BATTLEFUEL_GITHUB_ISSUE_REPO`). Unset token → the endpoint returns 503 (reporting disabled),
  so dev without a token degrades gracefully.

## Data Model

None — GitHub is the store. No DB table, no persistence in BattleFuel.

## API Endpoints

### `POST /api/v1/report-issue`
Auth: none (public site). Rate-limited per client IP.

Request body:
| field | type | rules |
|-------|------|-------|
| `title` | string | 1–120 chars, required |
| `kind` | `bug` \| `suggestion` | required |
| `scope` | `of4` \| `of8` \| `both` | required |
| `description` | string | 1–5000 chars, required |
| `severity` | `minor` \| `major` \| `blocker` \| null | optional (bug only) |
| `contact` | string \| null | optional, ≤120 chars |
| `context` | object \| null | client-captured: `app_version`, `role`, `view`, `user_agent`, `sim_clock` — each capped, untrusted |
| `hp` | string | honeypot — must be empty; non-empty ⇒ silently accepted-but-dropped |

Responses:
- `201 { "number": <int>, "url": "<html_url>" }` — issue created.
- `422` — validation error (bad enum / lengths).
- `429` — rate limit exceeded.
- `503 { "detail": "issue reporting is not configured" }` — no server token.
- `502` — GitHub call failed (network / non-2xx from GitHub).

## Business Rules

- **Label mapping (fixed allowlist — never user free-text):** `kind` → `bug` / `enhancement`;
  `scope` → `OF-4` / `OF-8` / `both`; `severity` → `severity:minor|major|blocker`.
- **Body composition:** description first, then an auto-context block (role, view, app version,
  sim-clock, user-agent) and an optional "Reported contact" line. All client-supplied context is
  length-capped before it enters the body.
- **Severity** only meaningful for bugs; ignored (dropped) for suggestions.
- **Rate limit:** in-memory per-IP sliding window (default 20/hour) — single-instance deploy, so a
  process-local limiter is sufficient. 429 when exceeded.
- **Honeypot:** a hidden `hp` field; a bot that fills it gets a 201 with no issue actually created.

## Data Flow

Greenfield. Client context is captured at submit time (app version from `VITE_APP_VERSION` build
arg, current role + view from app state, `navigator.userAgent`); it is advisory only.

## Dependencies

None (new leaf feature). Reuses the existing config/settings and api-client patterns.

## Security

This endpoint accepts **untrusted public input** and calls an external service with a secret.

- **Token handling:** `BATTLEFUEL_GITHUB_ISSUE_TOKEN` is read from the environment (host env-file,
  same pattern as the DB password) — never committed, never in the image, never sent to the client.
  `.env.example` ships an empty placeholder only.
- **Untrusted input boundary:** `title`, `description`, `contact`, and every `context` field are
  attacker-controlled. Mitigations: strict length caps; enum validation for `kind`/`scope`/
  `severity`; labels drawn from a fixed server-side allowlist (never from request strings); no
  assignees/mentions set by the server. Markdown injection into the issue body is accepted as
  low-impact (public repo, human triage) but bounded by the length caps.
- **Abuse:** per-IP rate limit + honeypot. A leaked/over-scoped token is out of scope here — the
  deploy guidance is a fine-grained PAT limited to this repo's Issues:write.
- **What the endpoint must NOT do:** echo the token, accept a caller-supplied repo/label set, or
  create issues on any repo other than the configured one.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
