"""Redis-backed room state.

The room document is stored as a single JSON blob under ``room:{id}``. This
makes refresh-recovery a single GET (the frontend rehydrates from ROOM_STATE)
and keeps the 2-player state easy to reason about. Mutations are serialized by
an in-process per-room asyncio lock — valid because the API runs as a single
worker (see Dockerfile); horizontal scaling would move this to a Redis lock.

Room document shape::

    {
      "id": "k7gq2",
      "game_type": "geoguess",
      "status": "waiting" | "in_progress" | "finished",
      "host_id": "did:plc:..." | "guest:...",
      "host_handle": "alice.bsky.social",
      "players": [
        {"id","handle","display_name","avatar_url","is_guest","connected","ready"}
      ],
      "game": { ... live game state ... } | null
    }
"""
from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from contextlib import asynccontextmanager
from typing import Any

from app.core.redis_client import get_redis

ROOM_TTL_SECONDS = 6 * 60 * 60  # rooms self-expire after 6h of inactivity
MAX_PLAYERS = 2

_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)


def _key(room_id: str) -> str:
    return f"room:{room_id}"


@asynccontextmanager
async def room_lock(room_id: str):
    async with _locks[room_id]:
        yield


async def get_room(room_id: str) -> dict[str, Any] | None:
    raw = await get_redis().get(_key(room_id))
    return json.loads(raw) if raw else None


async def save_room(room: dict[str, Any]) -> None:
    await get_redis().set(
        _key(room["id"]), json.dumps(room), ex=ROOM_TTL_SECONDS
    )


async def create_room(
    room_id: str, game_type: str, host: dict[str, Any]
) -> dict[str, Any]:
    room = {
        "id": room_id,
        "game_type": game_type,
        "status": "waiting",
        "host_id": host["id"],
        "host_handle": host["handle"],
        "players": [_player_slot(host)],
        "game": None,
    }
    await save_room(room)
    return room


def _player_slot(identity: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": identity["id"],
        "handle": identity["handle"],
        "display_name": identity.get("display_name") or identity["handle"],
        "avatar_url": identity.get("avatar_url"),
        "is_guest": identity.get("is_guest", True),
        "connected": False,
        "ready": False,
    }


def find_player(room: dict[str, Any], player_id: str) -> dict[str, Any] | None:
    for p in room["players"]:
        if p["id"] == player_id:
            return p
    return None


async def join_room(room_id: str, identity: dict[str, Any]) -> tuple[dict | None, str]:
    """Add a player to a room.

    Returns ``(room, status)`` where status is one of: "joined", "rejoined"
    (already a member — e.g. host or reconnect), "full", "not_found".
    """
    async with room_lock(room_id):
        room = await get_room(room_id)
        if room is None:
            return None, "not_found"

        existing = find_player(room, identity["id"])
        if existing is not None:
            return room, "rejoined"

        if len(room["players"]) >= MAX_PLAYERS:
            return room, "full"

        room["players"].append(_player_slot(identity))
        await save_room(room)
        return room, "joined"


async def set_connected(room_id: str, player_id: str, connected: bool) -> dict | None:
    async with room_lock(room_id):
        room = await get_room(room_id)
        if room is None:
            return None
        p = find_player(room, player_id)
        if p is None:
            return room
        p["connected"] = connected
        await save_room(room)
        return room


async def set_ready(room_id: str, player_id: str, ready: bool) -> dict | None:
    async with room_lock(room_id):
        room = await get_room(room_id)
        if room is None:
            return None
        p = find_player(room, player_id)
        if p is None:
            return room
        p["ready"] = ready
        await save_room(room)
        return room


async def set_status(room_id: str, status: str) -> dict | None:
    async with room_lock(room_id):
        room = await get_room(room_id)
        if room is None:
            return None
        room["status"] = status
        await save_room(room)
        return room


async def set_game(room_id: str, game_state: dict | None) -> dict | None:
    async with room_lock(room_id):
        room = await get_room(room_id)
        if room is None:
            return None
        room["game"] = game_state
        await save_room(room)
        return room


async def reset_ready(room_id: str) -> dict | None:
    """Clear all players' ready flags (used on rematch / round transitions)."""
    async with room_lock(room_id):
        room = await get_room(room_id)
        if room is None:
            return None
        for p in room["players"]:
            p["ready"] = False
        await save_room(room)
        return room
