"""Tests for the optimizer foundation (Wave 6 Feature 1: optimizer-foundation)."""

from __future__ import annotations

from httpx import ASGITransport, AsyncClient

from app.domain.advice import AdviceResult, Recommendation, RecommendationKind
from app.main import create_app


def test_ortools_importable() -> None:
    import ortools  # noqa: F401  — confirms the dependency is installed


class TestAdviceDomain:
    def test_recommendation_carries_rationale_and_action(self) -> None:
        rec = Recommendation(
            kind=RecommendationKind.REFUEL,
            target="inst-armor-1",
            action={"endpoint": "refuel-orders", "unit_id": "inst-armor-1"},
            score=12.5,
            rationale="closest fuelled truck",
        )
        assert rec.kind is RecommendationKind.REFUEL
        assert rec.rationale
        assert rec.action["endpoint"] == "refuel-orders"

    def test_advice_result_wraps_recommendations(self) -> None:
        result = AdviceResult(kind=RecommendationKind.ROUTE, recommendations=[], summary=None)
        assert result.kind is RecommendationKind.ROUTE
        assert result.recommendations == []


async def test_capabilities_endpoint() -> None:
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        resp = await c.get("/api/v1/advice/capabilities")
        assert resp.status_code == 200
        assert "kinds" in resp.json()
        assert isinstance(resp.json()["kinds"], list)
