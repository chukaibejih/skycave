"""Standalone head-to-head series: create, join, run each leg, resolve.

A series is a tournament fixture without the bracket, so it reuses the tournament
engine's `host_for_game` (hosting alternates each leg) and the same "each leg is
an ordinary versus room" model. The room is tagged with a `series_match` context
so `game_engine.end_game` reports the leg result home (mirrors the tournament
leg). Draws just advance to the next game; the series is decided the moment a
player reaches `wins_needed`, or by most legs won once the games run out.
"""
from __future__ import annotations

import random
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ids import new_room_id
from app.games.registry import all_games, get_game
from app.models.series import FINISHED, LIVE, OPEN, Series
from app.services import room_manager as rm
from app.services import tournament_engine as eng

# Every 1v1-capable game (everything except the retired, solo-only Crossing).
# Reflex games are intentionally in: a friendly series is anything-goes, and
# host_for_game alternates the host each leg so the tilt evens out.
def _pool() -> tuple[str, ...]:
    return tuple(g.type for g in all_games() if getattr(g, "versus_enabled", True))


class SeriesError(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


def _identity(did: str, handle: str, avatar: str | None) -> dict[str, Any]:
    """A stored player as the identity shape rooms expect."""
    return {
        "id": did,
        "handle": handle,
        "display_name": handle or "Player",
        "avatar_url": avatar,
        "is_guest": did.startswith("guest:"),
    }


def wins(s: Series) -> dict[str, int]:
    """Legs won per player (draws count for neither)."""
    out: dict[str, int] = {}
    for r in s.results or []:
        w = r.get("winner_did")
        if w:
            out[w] = out.get(w, 0) + 1
    return out


def leg_index(s: Series) -> int:
    """The leg being played now (0-based) = how many legs are already decided."""
    return len(s.results or [])


def current_game(s: Series) -> str | None:
    i = leg_index(s)
    games = s.games or []
    return games[i] if i < len(games) else None


async def create(db: AsyncSession, creator, wins_needed: int) -> Series:
    """Draw the games up front and open the series for an opponent to join."""
    wins_needed = 3 if int(wins_needed) >= 3 else 2  # bo5 or bo3
    length = wins_needed * 2 - 1
    pool = _pool()
    games = random.sample(list(pool), k=min(length, len(pool)))

    for _ in range(6):
        sid = new_room_id(6)
        if (await get(db, sid)) is None:
            break
    else:
        raise SeriesError("no_id", "Could not open a series. Try again.")

    s = Series(
        id=sid,
        status=OPEN,
        wins_needed=wins_needed,
        player1_did=creator.id,
        player1_handle=creator.display_name,
        player1_avatar=creator.avatar_url,
        games=games,
        results=[],
        rooms=[],
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return s


async def get(db: AsyncSession, series_id: str) -> Series | None:
    return (
        await db.execute(select(Series).where(Series.id == series_id))
    ).scalar_one_or_none()


async def join(db: AsyncSession, series_id: str, joiner) -> Series:
    s = await get(db, series_id)
    if s is None:
        raise SeriesError("not_found", "That series does not exist.")
    if joiner.id in (s.player1_did, s.player2_did):
        return s  # already a participant (host reopening, or the joiner returning)
    if s.player2_did is not None:
        raise SeriesError("full", "This series already has both players.")
    s.player2_did = joiner.id
    s.player2_handle = joiner.display_name
    s.player2_avatar = joiner.avatar_url
    s.status = LIVE
    await db.commit()
    await db.refresh(s)
    return s


def _resolve(s: Series) -> None:
    """Set winner + FINISHED if decidable; mutates in place (caller commits)."""
    w = wins(s)
    need = s.wins_needed
    for did, n in w.items():
        if n >= need:
            s.winner_did = did
            s.status = FINISHED
            return
    if leg_index(s) >= len(s.games or []):
        # Games ran out (draws ate legs): most legs won takes it, else no winner.
        ranked = sorted(w.items(), key=lambda kv: kv[1], reverse=True)
        if len(ranked) == 1 or (ranked and (len(ranked) < 2 or ranked[0][1] != ranked[1][1])):
            s.winner_did = ranked[0][0]
        else:
            s.winner_did = None
        s.status = FINISHED


async def record_result(
    db: AsyncSession,
    series_id: str,
    leg: int,
    *,
    room_id: str,
    winner_did: str | None,
    scores: dict[str, int] | None = None,
) -> None:
    """Record a finished leg and resolve the series. Idempotent per leg."""
    s = (
        await db.execute(
            select(Series).where(Series.id == series_id).with_for_update()
        )
    ).scalar_one_or_none()
    if s is None or s.status == FINISHED:
        return
    if leg != len(s.results or []):
        return  # out of order or already recorded - the leg only reports once
    results = list(s.results or [])
    results.append(
        {"game_type": current_game(s), "winner_did": winner_did, "room_id": room_id}
    )
    s.results = results
    _resolve(s)
    await db.commit()


async def next_room(db: AsyncSession, series_id: str, requester) -> str:
    """Open (or return) the room for the leg in play. Host alternates each leg.

    Serialised on the series row with a FOR UPDATE lock, because both players
    poll/press this and two simultaneous callers would otherwise mint two rooms
    and split the series across them (same reasoning as the tournament leg).
    """
    s = await get(db, series_id)
    if s is None:
        raise SeriesError("not_found", "That series does not exist.")
    if requester.id not in (s.player1_did, s.player2_did):
        raise SeriesError("not_player", "You are not in this series.")

    locked = (
        await db.execute(
            select(Series).where(Series.id == series_id).with_for_update()
        )
    ).scalar_one()
    if locked.status == OPEN or locked.player2_did is None:
        raise SeriesError("waiting", "Waiting for your opponent to join.")
    if locked.status == FINISHED:
        raise SeriesError("over", "This series is already decided.")

    leg = leg_index(locked)
    game_type = current_game(locked)
    if game_type is None or get_game(game_type) is None:
        raise SeriesError("broken", "This series is missing a game.")

    open_rooms = list(locked.rooms or [])
    while len(open_rooms) <= leg:
        open_rooms.append(None)
    existing = open_rooms[leg]
    if existing:
        live = await rm.get_room(existing)
        # A finished room already produced a result, which advances the leg, so
        # anything still sitting here is dead; this leg deserves a fresh one.
        if live is not None and live.get("status") != "finished":
            return existing  # leg already has a live room

    host_did = eng.host_for_game(locked.player1_did, locked.player2_did, leg)
    if host_did == locked.player1_did:
        host = _identity(locked.player1_did, locked.player1_handle, locked.player1_avatar)
        guest = _identity(locked.player2_did, locked.player2_handle or "", locked.player2_avatar)
    else:
        host = _identity(locked.player2_did, locked.player2_handle or "", locked.player2_avatar)
        guest = _identity(locked.player1_did, locked.player1_handle, locked.player1_avatar)

    for _ in range(5):
        room_id = new_room_id()
        if await rm.get_room(room_id) is None:
            break
    else:
        raise SeriesError("no_room", "Could not open a room. Try again.")

    await rm.create_room(room_id, game_type, host, mode="versus")
    await rm.join_room(room_id, guest)
    room = await rm.get_room(room_id)
    if room is not None:
        room["series_match"] = {"id": locked.id, "leg": leg}
        await rm.save_room(room)

    open_rooms[leg] = room_id
    locked.rooms = open_rooms
    await db.commit()
    return room_id
