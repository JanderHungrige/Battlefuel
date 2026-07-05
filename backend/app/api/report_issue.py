"""Report-a-bug / suggestion endpoint (doc 129). Mounted under /api/v1.

Public (no auth), rate-limited per client IP. Validates the report, then opens a GitHub issue via
:mod:`app.services.github_issue` using the server-held token. The token never reaches the client;
an unset token disables the endpoint (503) so dev without a token degrades gracefully.
"""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.services import github_issue as gh

router = APIRouter(tags=["report-issue"])

SettingsDep = Annotated[Settings, Depends(get_settings)]

# One process-local limiter shared across requests (single-instance deploy).
_LIMITER = gh.RateLimiter()


class IssueContextModel(BaseModel):
    """Client-captured, untrusted context (advisory only)."""

    app_version: str | None = None
    role: str | None = None
    view: str | None = None
    user_agent: str | None = None
    sim_clock: str | None = None


class ReportIssueRequest(BaseModel):
    title: str = Field(min_length=1, max_length=gh.MAX_TITLE)
    kind: Literal["bug", "suggestion"]
    scope: Literal["of4", "of8", "both"]
    description: str = Field(min_length=1, max_length=gh.MAX_DESCRIPTION)
    severity: Literal["minor", "major", "blocker"] | None = None
    contact: str | None = Field(default=None, max_length=gh.MAX_CONTACT)
    context: IssueContextModel | None = None
    # Honeypot — real users never see/fill it; bots that do get a 201 with no issue created.
    hp: str = ""


class ReportIssueResponse(BaseModel):
    number: int
    url: str


@router.post("/report-issue", status_code=201)
async def report_issue(
    req: ReportIssueRequest, request: Request, settings: SettingsDep
) -> ReportIssueResponse:
    """Open a GitHub issue from an in-app bug / suggestion report."""
    if not settings.github_issue_token:
        raise HTTPException(status_code=503, detail="issue reporting is not configured")

    client_ip = request.client.host if request.client else "unknown"
    if not _LIMITER.allow(client_ip, settings.report_issue_rate_limit_per_hour):
        raise HTTPException(status_code=429, detail="too many reports — please try again later")

    # Honeypot tripped: acknowledge without creating anything.
    if req.hp:
        return ReportIssueResponse(number=0, url="")

    context = gh.IssueContext(**req.context.model_dump()) if req.context is not None else None
    draft = gh.build_issue(
        title=req.title,
        kind=req.kind,
        scope=req.scope,
        description=req.description,
        severity=req.severity,
        contact=req.contact,
        context=context,
    )
    try:
        result = await run_in_threadpool(
            gh.post_issue,
            draft,
            repo=settings.github_issue_repo,
            token=settings.github_issue_token,
        )
    except gh.GitHubIssueError as exc:
        raise HTTPException(status_code=502, detail="could not create the issue") from exc
    return ReportIssueResponse(number=result.number, url=result.url)
