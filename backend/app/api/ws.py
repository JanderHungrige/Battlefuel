"""WebSocket live-update channel (Wave 3, sim-engine). Mounted under /api/v1.

Clients connect to ``/api/v1/ws`` and receive ``unit_update`` messages as the sim engine
advances active move orders.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

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


@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await manager.connect(ws)
    try:
        while True:
            # We don't expect client messages; this keeps the socket open until it closes.
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)
