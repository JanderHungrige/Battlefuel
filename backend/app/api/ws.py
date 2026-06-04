"""WebSocket live-update channel (Wave 3, sim-engine). Mounted under /api/v1.

Clients connect to ``/api/v1/ws`` and receive ``unit_update`` messages as the sim engine
advances active move orders.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.domain.combat_event import combat_event_frame
from app.providers.combat_events import build_combat_event_feed_provider

router = APIRouter()


class ConnectionManager:
    """Tracks connected WebSocket clients and fans out broadcasts."""

    def __init__(self) -> None:
        self._active: set[WebSocket] = set()

    @property
    def count(self) -> int:
        return len(self._active)

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._active.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self._active.discard(ws)

    async def broadcast(self, message: dict[str, Any]) -> None:
        for ws in list(self._active):
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(ws)


# Process-wide manager shared by the WebSocket endpoint and the sim engine.
manager = ConnectionManager()


async def send_combat_snapshot(ws: WebSocket) -> int:
    """Send the current located-threat picture to a just-connected client.

    Combat events are a persistent threat laydown, not one-shot radio traffic: without this, a
    client that connects after the timed feed has fired (e.g. a browser reload mid-sim) would never
    see the threat squares. Returns the number of frames sent.
    """
    events = build_combat_event_feed_provider().events()
    for ev in events:
        await ws.send_json(combat_event_frame(ev, ev.at_game_s))
    return len(events)


@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await manager.connect(ws)
    await send_combat_snapshot(ws)
    try:
        while True:
            # We don't expect client messages; this keeps the socket open until it closes.
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)
