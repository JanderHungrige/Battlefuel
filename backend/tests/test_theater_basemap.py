"""Tests for the theater config and offline basemap (Wave 2 Feature 2: osm-theater-data)."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import Settings
from app.domain.theater import HOHENFELS, BBox, Theater

_PMTILES = Path(__file__).resolve().parents[2] / "data" / "hohenfels.pmtiles"
# PMTiles v3 spec files begin with the ASCII magic "PMTiles".
_PMTILES_MAGIC = b"PMTiles"


class TestTheater:
    def test_hohenfels_is_well_formed(self) -> None:
        assert HOHENFELS.id == "hohenfels"
        assert isinstance(HOHENFELS, Theater)

    def test_center_lies_within_bbox(self) -> None:
        b = HOHENFELS.bbox
        assert b.west <= HOHENFELS.center_lon <= b.east
        assert b.south <= HOHENFELS.center_lat <= b.north

    def test_bbox_rejects_inverted_longitude(self) -> None:
        with pytest.raises(ValidationError, match="west must be < east"):
            BBox(west=12.0, south=49.0, east=11.0, north=50.0)

    def test_bbox_rejects_inverted_latitude(self) -> None:
        with pytest.raises(ValidationError, match="south must be < north"):
            BBox(west=11.0, south=50.0, east=12.0, north=49.0)


class TestBasemapArtifact:
    def test_pmtiles_exists_and_is_valid(self) -> None:
        if not _PMTILES.exists():
            pytest.skip("data/hohenfels.pmtiles not built — run backend/scripts/build_basemap.sh")
        assert _PMTILES.stat().st_size > 1024, "pmtiles file is suspiciously small"
        with _PMTILES.open("rb") as fh:
            assert fh.read(7) == _PMTILES_MAGIC, "not a valid PMTiles v3 file"


@pytest.mark.db
class TestOsmInPostgis:
    async def test_osm_multipolygons_imported(self) -> None:
        engine = create_async_engine(Settings().database_url)
        try:
            async with engine.connect() as conn:
                exists = (
                    await conn.execute(text("SELECT to_regclass('public.osm_multipolygons')"))
                ).scalar()
                if exists is None:
                    pytest.skip("osm_multipolygons not imported — run import_osm_to_postgis.sh")
                count = (
                    await conn.execute(text("SELECT count(*) FROM osm_multipolygons"))
                ).scalar_one()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        finally:
            await engine.dispose()
        assert count > 0
