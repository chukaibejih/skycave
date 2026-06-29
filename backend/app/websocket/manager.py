"""In-process registry of live WebSocket connections, keyed by room.

Single-worker deployment (see Dockerfile) lets us keep sockets in memory.
Authoritative state lives in Redis, so a refresh/reconnect rehydrates from
there — this registry only tracks who is currently wired up for broadcasting.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger("skycave.ws")


class ConnectionManager:
    def __init__(self) -> None:
        # room_id -> {player_id -> WebSocket}
        self._rooms: dict[str, dict[str, WebSocket]] = {}

    async def connect(self, room_id: str, player_id: str, ws: WebSocket) -> None:
        await ws.accept()
        room = self._rooms.setdefault(room_id, {})
        # Replace any stale socket for this player (reconnect).
        old = room.get(player_id)
        if old is not None and old is not ws:
            try:
                await old.close()
            except Exception:  # noqa: BLE001 - best-effort close
                pass
        room[player_id] = ws

    def disconnect(self, room_id: str, player_id: str, ws: WebSocket) -> None:
        room = self._rooms.get(room_id)
        if not room:
            return
        # Only drop if the registered socket is the one disconnecting (guards
        # against a fresh reconnect being clobbered by the old socket's cleanup).
        if room.get(player_id) is ws:
            room.pop(player_id, None)
        if not room:
            self._rooms.pop(room_id, None)

    def is_connected(self, room_id: str, player_id: str) -> bool:
        return player_id in self._rooms.get(room_id, {})

    def connected_ids(self, room_id: str) -> list[str]:
        return list(self._rooms.get(room_id, {}).keys())

    async def send(self, room_id: str, player_id: str, message: dict[str, Any]) -> None:
        ws = self._rooms.get(room_id, {}).get(player_id)
        if ws is None:
            return
        try:
            await ws.send_json(message)
        except Exception:  # noqa: BLE001
            logger.debug("send failed to %s in %s", player_id, room_id)

    async def broadcast(
        self,
        room_id: str,
        message: dict[str, Any],
        *,
        exclude: str | None = None,
    ) -> None:
        for pid, ws in list(self._rooms.get(room_id, {}).items()):
            if pid == exclude:
                continue
            try:
                await ws.send_json(message)
            except Exception:  # noqa: BLE001
                logger.debug("broadcast failed to %s in %s", pid, room_id)


manager = ConnectionManager()
