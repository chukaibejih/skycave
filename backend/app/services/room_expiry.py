"""Auto-close 1v1 rooms that never get an opponent.

A versus room is "armed" at creation: a Redis key ``room_expiry:{id}`` with a 15
minute TTL, plus an in-process timer. If no second player has joined when the
window closes, the room transitions to "expired" (in Redis and PostgreSQL) and a
ROOM_EXPIRED event is broadcast to anyone still connected. Solo rooms are never
armed.

Detection is belt-and-suspenders so it works both live and cold:
  - live: the in-process timer fires and broadcasts ROOM_EXPIRED.
  - cold: ``ensure_fresh`` runs on every read, so a link opened after the window
    (or after a server restart that dropped the timer) still resolves to a clean
    expired state rather than a stale "waiting" one. The Redis key's own TTL is
    the source of truth for "is the window still open".
"""
from __future__ import annotations

import asyncio
import logging
import os
import time

from app.core.redis_client import get_redis
from app.services import room_manager as rooms
from app.websocket import events
from app.websocket.manager import manager

logger = logging.getLogger("skycave.expiry")

# A waiting room with no opponent closes after 15 minutes. Overridable via env
# only to speed up automated testing; production uses the default.
EXPIRY_SECONDS = int(os.getenv("ROOM_EXPIRY_SECONDS", str(15 * 60)))

# room_id -> pending expiry task (in-process; single-worker deployment).
_timers: dict[str, asyncio.Task] = {}


def _key(room_id: str) -> str:
    return f"room_expiry:{room_id}"


def _has_opponent(room: dict) -> bool:
    return len(room.get("players", [])) >= 2


def _cancel(room_id: str) -> None:
    task = _timers.pop(room_id, None)
    try:
        current = asyncio.current_task()
    except RuntimeError:
        current = None
    # Never cancel the task we are running inside (the expiry runner itself).
    if task is not None and task is not current:
        task.cancel()


def _schedule(room_id: str) -> None:
    _cancel(room_id)

    async def runner():
        try:
            await asyncio.sleep(EXPIRY_SECONDS)
            await _expire(room_id)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("expiry task failed for room %s", room_id)
        finally:
            if _timers.get(room_id) is asyncio.current_task():
                _timers.pop(room_id, None)

    _timers[room_id] = asyncio.create_task(runner())


async def arm(room_id: str) -> int:
    """Open the 15 minute expiry window. Returns the absolute expiry unix ts.

    Sets the Redis TTL key and stamps ``expires_at`` onto the room document so
    the client can render a live countdown.
    """
    expires_at = int(time.time()) + EXPIRY_SECONDS
    await get_redis().set(_key(room_id), "1", ex=EXPIRY_SECONDS)
    async with rooms.room_lock(room_id):
        room = await rooms.get_room(room_id)
        if room is not None:
            room["expires_at"] = expires_at
            await rooms.save_room(room)
    _schedule(room_id)
    return expires_at


async def disarm(room_id: str) -> None:
    """Cancel expiry once an opponent has joined (or the game has started)."""
    _cancel(room_id)
    await get_redis().delete(_key(room_id))


async def _expire(room_id: str) -> None:
    """Transition a still-empty waiting room to expired and notify clients."""
    async with rooms.room_lock(room_id):
        room = await rooms.get_room(room_id)
        if room is None or room["status"] != "waiting" or _has_opponent(room):
            return  # game started, opponent joined, or room already gone
        room["status"] = "expired"
        await rooms.save_room(room)
    await get_redis().delete(_key(room_id))
    await _mark_pg_expired(room_id)
    await manager.broadcast(
        room_id, events.message(events.ROOM_EXPIRED, {"room_id": room_id})
    )
    logger.info("room %s expired (no opponent joined)", room_id)


async def ensure_fresh(room: dict) -> dict:
    """Lazily expire a room whose window has elapsed. Safe to call on every read.

    Returns the room, transitioned to "expired" if its Redis window is gone and
    it is still an empty waiting room.
    """
    if room["status"] != "waiting" or _has_opponent(room):
        return room
    if room.get("expires_at") is None:
        return room  # never armed (e.g. solo room)
    if await get_redis().exists(_key(room["id"])):
        return room  # window still open
    room_id = room["id"]
    async with rooms.room_lock(room_id):
        current = await rooms.get_room(room_id)
        if current is None:
            return room
        if current["status"] == "waiting" and not _has_opponent(current):
            current["status"] = "expired"
            await rooms.save_room(current)
        room = current
    await _mark_pg_expired(room_id)
    return room


async def _mark_pg_expired(room_id: str) -> None:
    """Persist the expired status so the link resolves after Redis eviction."""
    try:
        from app.core.database import AsyncSessionLocal
        from app.models import Room

        async with AsyncSessionLocal() as db:
            room = await db.get(Room, room_id)
            if room is not None and room.status == "waiting":
                room.status = "expired"
                await db.commit()
    except Exception:  # noqa: BLE001 - persistence must never break the flow
        logger.exception("failed to mark room %s expired in PG", room_id)
