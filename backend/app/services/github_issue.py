"""Report-a-bug / suggestion → GitHub issue (doc 129).

``build_issue`` is pure (request fields → title / body / labels) and unit-tested. ``post_issue``
performs the GitHub REST call with the server-held token via the Python **stdlib ``urllib``** — the
production image installs runtime deps only (no ``httpx``), so we avoid a new runtime dependency;
the async endpoint runs it in a threadpool. ``RateLimiter`` is a process-local per-IP guard
(single-instance deploy, so in-memory is sufficient).

The token is never logged, never returned, and only ever read from settings by the caller.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Literal

IssueKind = Literal["bug", "suggestion"]
IssueScope = Literal["of4", "of8", "both"]
IssueSeverity = Literal["minor", "major", "blocker"]

# Length caps on every attacker-controlled string before it enters the body (doc 129 Security).
MAX_TITLE = 120
MAX_DESCRIPTION = 5000
MAX_CONTACT = 120
MAX_CONTEXT_FIELD = 300

# Fixed label allowlists — labels are NEVER taken from request free-text.
_KIND_LABEL: dict[str, str] = {"bug": "bug", "suggestion": "enhancement"}
_SCOPE_LABEL: dict[str, str] = {"of4": "OF-4", "of8": "OF-8", "both": "both"}

GITHUB_API = "https://api.github.com"


class GitHubIssueError(RuntimeError):
    """The GitHub issue call failed (unreachable, timeout, or non-2xx)."""


@dataclass(frozen=True)
class IssueContext:
    """Client-captured, untrusted context appended to the issue body (advisory only)."""

    app_version: str | None = None
    role: str | None = None
    view: str | None = None
    user_agent: str | None = None
    sim_clock: str | None = None


@dataclass(frozen=True)
class IssueDraft:
    title: str
    body: str
    labels: list[str]


@dataclass(frozen=True)
class IssueResult:
    number: int
    url: str


def _clip(text: str, limit: int) -> str:
    """Trim, cap length, and neutralise markdown-table breakers (pipes / newlines)."""
    return text.strip().replace("|", "\\|").replace("\r", " ").replace("\n", " ")[:limit]


def build_issue(
    *,
    title: str,
    kind: IssueKind,
    scope: IssueScope,
    description: str,
    severity: IssueSeverity | None = None,
    contact: str | None = None,
    context: IssueContext | None = None,
) -> IssueDraft:
    """Map a validated report to a GitHub issue draft. Pure — no network, deterministic."""
    labels = [_KIND_LABEL[kind], _SCOPE_LABEL[scope]]
    if kind == "bug" and severity is not None:
        labels.append(f"severity:{severity}")

    # Description is kept as-is (multi-line allowed) but length-capped; the context table escapes.
    lines: list[str] = [description.strip()[:MAX_DESCRIPTION], "", "---", ""]
    lines += ["| field | value |", "|---|---|"]
    lines.append(f"| Type | {kind} |")
    lines.append(f"| Scope | {_SCOPE_LABEL[scope]} |")
    if kind == "bug" and severity is not None:
        lines.append(f"| Severity | {severity} |")
    if context is not None:
        for label, value in (
            ("Role", context.role),
            ("View", context.view),
            ("App version", context.app_version),
            ("Sim clock", context.sim_clock),
            ("User agent", context.user_agent),
        ):
            if value:
                lines.append(f"| {label} | {_clip(value, MAX_CONTEXT_FIELD)} |")
    if contact:
        lines.append(f"| Contact | {_clip(contact, MAX_CONTACT)} |")
    lines += ["", "_Filed from the in-app Report panel._"]

    return IssueDraft(title=_clip(title, MAX_TITLE), body="\n".join(lines), labels=labels)


def post_issue(draft: IssueDraft, *, repo: str, token: str, timeout: float = 10.0) -> IssueResult:
    """Create the issue on ``repo`` via the GitHub REST API. Raises :class:`GitHubIssueError`."""
    payload = json.dumps(
        {"title": draft.title, "body": draft.body, "labels": draft.labels}
    ).encode("utf-8")
    # Fixed https GitHub API host (not user-controlled); stdlib avoids a runtime httpx dependency.
    req = urllib.request.Request(
        f"{GITHUB_API}/repos/{repo}/issues",
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            "User-Agent": "BattleFuel-ReportIssue",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as exc:  # non-2xx from GitHub (bad token, repo, validation)
        raise GitHubIssueError(f"GitHub returned HTTP {exc.code}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:  # network / DNS / timeout
        raise GitHubIssueError(f"GitHub unreachable: {exc}") from exc
    return IssueResult(number=int(data["number"]), url=str(data["html_url"]))


class RateLimiter:
    """Process-local sliding-window limiter keyed by client IP (single-instance deploy)."""

    _WINDOW_S = 3600.0

    def __init__(self) -> None:
        self._hits: defaultdict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str, max_per_window: int, *, now: float | None = None) -> bool:
        """Record a hit for ``key``; False if it exceeds ``max_per_window`` in the last hour."""
        stamp = time.monotonic() if now is None else now
        hits = self._hits[key]
        while hits and stamp - hits[0] > self._WINDOW_S:
            hits.popleft()
        if len(hits) >= max_per_window:
            return False
        hits.append(stamp)
        return True
