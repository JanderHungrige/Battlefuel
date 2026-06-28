"""Routing-graph overlay endpoint (v2 Wave 20 F1, routing-graph-overlay-api). Mounted under
/api/v1.

Serves the pgRouting network — the `ways` edges and `ways_vertices_pgr` vertices — as light
geometry so the operator can toggle an overlay and *see* the graph the router actually uses. Read
only; the Hohenfels graph is small (~2.7k edges) so the whole theater is returned in one call.
"""

from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session

router = APIRouter(tags=["routing-graph"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


class GraphEdge(BaseModel):
    """A routing edge: its [lon, lat] polyline + the threat level used for SAFE costing."""

    gid: int
    geometry: list[list[float]]
    threat_level: int


class GraphNode(BaseModel):
    """A routing vertex (road intersection / endpoint) as a [lon, lat] point."""

    id: int
    point: list[float]


class RoutingGraph(BaseModel):
    edges: list[GraphEdge]
    nodes: list[GraphNode]


def _coords(geom: str) -> list[list[float]]:
    data = json.loads(geom)
    if data["type"] == "LineString":
        return [[float(x), float(y)] for x, y in data["coordinates"]]
    if data["type"] == "MultiLineString":
        return [[float(x), float(y)] for line in data["coordinates"] for x, y in line]
    return []


@router.get("/routing-graph")
async def get_routing_graph(session: SessionDep) -> RoutingGraph:
    """The pgRouting graph (ways edges + vertices) for the map overlay (v2 Wave 20 F1)."""
    edge_rows = (
        await session.execute(
            text(
                "SELECT gid, ST_AsGeoJSON(the_geom) AS g, COALESCE(threat_level, 0) AS t FROM ways"
            )
        )
    ).all()
    node_rows = (
        await session.execute(
            text("SELECT id, ST_X(the_geom) AS lon, ST_Y(the_geom) AS lat FROM ways_vertices_pgr")
        )
    ).all()
    edges = [
        GraphEdge(gid=int(gid), geometry=_coords(g), threat_level=int(t))
        for gid, g, t in edge_rows
        if g
    ]
    nodes = [GraphNode(id=int(i), point=[float(lon), float(lat)]) for i, lon, lat in node_rows]
    return RoutingGraph(edges=edges, nodes=nodes)
