"""Drawn-edge endpoints (v2 Wave 20 F4, connect-drawn-to-graph). Mounted under /api/v1.

POST persists an operator-drawn road/path then injects it into the routing graph; DELETE removes it
and re-injects the rest. The injection rebuilds all drawn ``ways`` rows from the table, so the graph
always reflects the persisted drawn edges.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.domain.drawn_edge import DrawnEdge, DrawnEdgeCreate
from app.providers.drawn_edges import DrawnEdgeProvider, build_drawn_edge_provider
from app.services.drawn_graph import connect_flags, inject_drawn_edges

router = APIRouter(tags=["drawn-edges"])


def get_drawn_edge_provider() -> DrawnEdgeProvider:
    return build_drawn_edge_provider()


SessionDep = Annotated[AsyncSession, Depends(get_session)]
DrawnEdgeDep = Annotated[DrawnEdgeProvider, Depends(get_drawn_edge_provider)]


@router.post("/drawn-edges", status_code=201)
async def create_drawn_edge(
    req: DrawnEdgeCreate, session: SessionDep, edges: DrawnEdgeDep
) -> DrawnEdge:
    """Persist a drawn road/path and inject it (plus chosen connectors) into the routing graph."""
    connect_start, connect_end = connect_flags(req.connect)
    edge = await edges.create(
        session,
        req.kind,
        req.coordinates,
        connect_start=connect_start,
        connect_end=connect_end,
    )
    await inject_drawn_edges(session)
    return edge


@router.get("/drawn-edges")
async def list_drawn_edges(session: SessionDep, edges: DrawnEdgeDep) -> list[DrawnEdge]:
    return list(await edges.list_all(session))


@router.delete("/drawn-edges/{edge_id}", status_code=200)
async def delete_drawn_edge(
    edge_id: str, session: SessionDep, edges: DrawnEdgeDep
) -> dict[str, str]:
    """Remove a drawn edge and re-inject the remaining ones."""
    removed = await edges.delete(session, edge_id)
    if not removed:
        raise HTTPException(status_code=404, detail=f"drawn edge {edge_id!r} not found")
    await inject_drawn_edges(session)
    return {"id": edge_id, "status": "removed"}
