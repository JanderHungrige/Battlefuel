"""ORM model for the ``drawn_edges`` table (v2 Wave 20 F4, connect-drawn-to-graph).

A drawn edge is an operator-authored road (solid) or path (track). It persists here — separate
from the osm2pgrouting ``ways`` graph, which is rebuilt from scratch on every reseed — and is
re-injected into ``ways`` / ``ways_vertices_pgr`` by ``services.drawn_graph.inject_drawn_edges``.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class DrawnEdgeRow(Base):
    __tablename__ = "drawn_edges"

    id: Mapped[str] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(default="road")
    # Ordered [lon, lat] waypoints of the drawn line (>= 2).
    coordinates: Mapped[list[list[float]]] = mapped_column(JSONB)
    connect_start: Mapped[bool] = mapped_column(Boolean, default=False)
    connect_end: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
