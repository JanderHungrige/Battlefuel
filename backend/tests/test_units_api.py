"""Tests for the unit query API (Feature 4: unit-query-api)."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.providers.seed_data import SEED_UNITS


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(create_app()) as c:
        yield c


def test_health(client: TestClient) -> None:
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_lists_all_units(client: TestClient) -> None:
    resp = client.get("/api/v1/units")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == len(SEED_UNITS)


def test_unit_payload_includes_full_stats(client: TestClient) -> None:
    resp = client.get("/api/v1/units/armor-tank-coy")
    assert resp.status_code == 200
    unit = resp.json()
    assert unit["id"] == "armor-tank-coy"
    assert unit["nato_unit_type"] == "armor"
    assert unit["sidc"].isdigit() and len(unit["sidc"]) == 20
    # Nested profiles present
    assert unit["fuel"]["consumption_combat_lph"] >= unit["fuel"]["consumption_normal_lph"]
    assert unit["movement"]["speed_road_kph"] >= unit["movement"]["speed_offroad_kph"]
    assert unit["combat"]["armor_class"] == "heavy"
    # Computed fields are serialized
    assert unit["endurance_hours_normal"] == pytest.approx(18000 / 900)


def test_filter_by_nato_unit_type(client: TestClient) -> None:
    resp = client.get("/api/v1/units", params={"nato_unit_type": "fuel_supply"})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) >= 1
    assert all(u["nato_unit_type"] == "fuel_supply" for u in body)


def test_filter_by_echelon(client: TestClient) -> None:
    resp = client.get("/api/v1/units", params={"echelon": "company"})
    assert resp.status_code == 200
    assert all(u["echelon"] == "company" for u in resp.json())


def test_unknown_unit_returns_404(client: TestClient) -> None:
    resp = client.get("/api/v1/units/does-not-exist")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"]


def test_invalid_filter_value_is_rejected(client: TestClient) -> None:
    resp = client.get("/api/v1/units", params={"nato_unit_type": "wizards"})
    assert resp.status_code == 422
