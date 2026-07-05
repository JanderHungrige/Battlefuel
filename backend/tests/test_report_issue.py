"""Tests for the report-a-bug / suggestion endpoint + issue builder (doc 129).

No DB: the endpoint only validates, rate-limits, and posts to GitHub. The GitHub call is
monkeypatched, so nothing hits the network.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from httpx import ASGITransport, AsyncClient

from app.api import report_issue as ri
from app.config import Settings
from app.main import create_app
from app.services import github_issue as gh


@pytest.fixture(autouse=True)
def _reset_limiter() -> Iterator[None]:
    """Each test starts with a fresh per-IP rate limiter."""
    ri._LIMITER = gh.RateLimiter()
    yield


def _client(settings: Settings) -> AsyncClient:
    app = create_app()
    app.dependency_overrides[ri.get_settings] = lambda: settings
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _settings(**over: object) -> Settings:
    base: dict[str, object] = {
        "github_issue_token": "tok",
        "github_issue_repo": "owner/repo",
        "report_issue_rate_limit_per_hour": 20,
    }
    base.update(over)
    return Settings(**base)  # type: ignore[arg-type]


_VALID = {
    "title": "Route flickers on threat update",
    "kind": "bug",
    "scope": "of4",
    "description": "The SAFE route redraws twice when a threat lands.",
    "severity": "major",
    "context": {"role": "OF-4", "view": "map", "app_version": "abc123"},
}


class TestBuildIssue:
    def test_bug_with_severity_and_context(self) -> None:
        draft = gh.build_issue(
            title="T",
            kind="bug",
            scope="both",
            description="desc",
            severity="blocker",
            context=gh.IssueContext(role="OF-8", view="supply"),
        )
        assert draft.labels == ["bug", "both", "severity:blocker"]
        assert "| Role | OF-8 |" in draft.body
        assert "| Severity | blocker |" in draft.body

    def test_suggestion_drops_severity_and_uses_enhancement_label(self) -> None:
        draft = gh.build_issue(
            title="T", kind="suggestion", scope="of8", description="idea", severity="major"
        )
        # severity is meaningless for a suggestion → no severity label
        assert draft.labels == ["enhancement", "OF-8"]
        assert "severity" not in draft.body.lower()

    def test_pipes_and_length_are_neutralised(self) -> None:
        draft = gh.build_issue(
            title="x" * 500,
            kind="bug",
            scope="of4",
            description="d",
            contact="a|b\nc",
            context=gh.IssueContext(user_agent="ua|with|pipes"),
        )
        assert len(draft.title) <= gh.MAX_TITLE
        assert "a\\|b c" in draft.body  # pipe escaped, newline flattened
        assert "ua\\|with\\|pipes" in draft.body


class TestReportIssueEndpoint:
    async def test_creates_issue(self, monkeypatch: pytest.MonkeyPatch) -> None:
        seen: dict[str, object] = {}

        def fake_post(
            draft: gh.IssueDraft, *, repo: str, token: str, timeout: float = 10.0
        ) -> gh.IssueResult:
            seen["repo"] = repo
            seen["token"] = token
            seen["labels"] = draft.labels
            return gh.IssueResult(number=42, url="https://github.com/owner/repo/issues/42")

        monkeypatch.setattr(gh, "post_issue", fake_post)
        async with _client(_settings()) as client:
            res = await client.post("/api/v1/report-issue", json=_VALID)
        assert res.status_code == 201
        assert res.json() == {"number": 42, "url": "https://github.com/owner/repo/issues/42"}
        assert seen["repo"] == "owner/repo"
        assert seen["labels"] == ["bug", "OF-4", "severity:major"]

    async def test_503_when_token_unset(self) -> None:
        async with _client(_settings(github_issue_token="")) as client:
            res = await client.post("/api/v1/report-issue", json=_VALID)
        assert res.status_code == 503

    async def test_honeypot_creates_nothing(self, monkeypatch: pytest.MonkeyPatch) -> None:
        called = False

        def fake_post(*_a: object, **_k: object) -> gh.IssueResult:
            nonlocal called
            called = True
            return gh.IssueResult(number=1, url="x")

        monkeypatch.setattr(gh, "post_issue", fake_post)
        async with _client(_settings()) as client:
            res = await client.post("/api/v1/report-issue", json={**_VALID, "hp": "i am a bot"})
        assert res.status_code == 201
        assert res.json()["number"] == 0
        assert called is False

    async def test_validation_rejects_bad_enum(self) -> None:
        async with _client(_settings()) as client:
            res = await client.post("/api/v1/report-issue", json={**_VALID, "scope": "navy"})
        assert res.status_code == 422

    async def test_github_failure_is_502(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def boom(*_a: object, **_k: object) -> gh.IssueResult:
            raise gh.GitHubIssueError("nope")

        monkeypatch.setattr(gh, "post_issue", boom)
        async with _client(_settings()) as client:
            res = await client.post("/api/v1/report-issue", json=_VALID)
        assert res.status_code == 502

    async def test_rate_limit_returns_429(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(
            gh, "post_issue", lambda *_a, **_k: gh.IssueResult(number=1, url="x")
        )
        async with _client(_settings(report_issue_rate_limit_per_hour=1)) as client:
            first = await client.post("/api/v1/report-issue", json=_VALID)
            second = await client.post("/api/v1/report-issue", json=_VALID)
        assert first.status_code == 201
        assert second.status_code == 429
