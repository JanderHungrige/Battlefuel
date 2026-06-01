"""Tests for the theater endpoint (Feature 5 support)."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(create_app()) as c:
        yield c


def test_theater_endpoint_returns_hohenfels(client: TestClient) -> None:
    resp = client.get("/api/v1/theater")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == "hohenfels"
    assert body["bbox"]["west"] < body["bbox"]["east"]
    assert body["bbox"]["south"] < body["bbox"]["north"]
    assert "default_zoom" in body
