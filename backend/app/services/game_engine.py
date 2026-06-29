"""Game orchestration: drives the round lifecycle and owns all scoring.

Flow per game::

    start_game -> GAME_START
      start_round(n) -> ROUND_START          (+ schedule round timer)
        handle_action(...)                   (validate server-side)
          _finish_round -> ROUND_RESULT      (+ schedule next)
      ... repeat until total_rounds ...
    end_game -> GAME_END                      (+ persist GameSession, update stats)

Round timers are in-process asyncio tasks (single-worker deployment). Each
carries a (round, generation) guard so a late timer can never resolve a round
that has already been resolved by a player action.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from app.games.base import RACE
from app.games.registry import get_game
from app.services import room_manager as rooms
from app.websocket import events
from app.websocket.manager import manager

logger = logging.getLogger("skycave.engine")

# room_id -> asyncio.Task for the pending round timeout / transition
_timers: dict[str, asyncio.Task] = {}


def _cancel_timer(room_id: str) -> None:
    task = _timers.get(room_id)
    if task is None:
        return
    # Never cancel the task we're currently running inside — start_round and
    # end_game execute *as* the scheduled timer task, so cancelling _timers here
    # would cancel ourselves and abort at the next await. In that case just
    # release the slot; the task is already finishing on its own.
    try:
        current = asyncio.current_task()
    except RuntimeError:
        current = None
    _timers.pop(room_id, None)
    if task is not current:
        task.cancel()


def _schedule(room_id: str, delay: float, coro_factory) -> None:
    _cancel_timer(room_id)

    async def runner():
        try:
            await asyncio.sleep(delay)
            await coro_factory()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("scheduled task failed for room %s", room_id)

    _timers[room_id] = asyncio.create_task(runner())


def _connected_player_ids(room: dict[str, Any]) -> list[str]:
    ids = set(manager.connected_ids(room["id"]))
    return [p["id"] for p in room["players"] if p["id"] in ids]


def _participant_ids(room: dict[str, Any]) -> list[str]:
    return [p["id"] for p in room["players"]]


# --------------------------------------------------------------------------- #
# Game start
# --------------------------------------------------------------------------- #

async def start_game(room_id: str) -> None:
    async with rooms.room_lock(room_id):
        room = await rooms.get_room(room_id)
        if room is None:
            return
        game = get_game(room["game_type"])
        if game is None:
            return
        if room["status"] == "in_progress":
            return  # already running (guard against duplicate READY)

        scores = {p["id"]: 0 for p in room["players"]}
        game_state = {
            "game_type": game.type,
            "total_rounds": game.total_rounds,
            "mode": game.mode,
            "round": 0,
            "phase": "starting",
            "scores": scores,
            "history": [],          # [{"round": n, "points": {pid: pts}}]
            "round_data": None,     # public payload of the current round
            "round_secret": None,   # answer (never sent to clients)
            "round_actions": {},    # pid -> action / lockout marker
            "round_started_at": None,
            "round_ends_at": None,
            "last_result": None,
        }
        room["status"] = "in_progress"
        room["game"] = game_state
        await rooms.save_room(room)

    await manager.broadcast(
        room_id,
        events.message(
            events.GAME_START,
            {
                "game_type": game.type,
                "game_name": game.name,
                "total_rounds": game.total_rounds,
                "mode": game.mode,
                "players": room["players"],
                "scores": scores,
            },
        ),
    )
    # Brief beat so clients can show the "GO" portal collapse before round 1.
    _schedule(room_id, 1.2, lambda: start_round(room_id, 1))


# --------------------------------------------------------------------------- #
# Round lifecycle
# --------------------------------------------------------------------------- #

async def start_round(room_id: str, round_number: int) -> None:
    async with rooms.room_lock(room_id):
        room = await rooms.get_room(room_id)
        if room is None or room.get("game") is None:
            return
        game = get_game(room["game_type"])
        if game is None:
            return

        public, secret = game.new_round(round_number)
        now = time.time()
        gs = room["game"]
        gs["round"] = round_number
        gs["phase"] = "active"
        gs["round_data"] = public
        gs["round_secret"] = secret
        gs["round_actions"] = {}
        gs["round_started_at"] = now
        gs["round_ends_at"] = now + game.round_time
        gs["last_result"] = None
        await rooms.save_room(room)

    await manager.broadcast(
        room_id,
        events.message(
            events.ROUND_START,
            {
                "round": round_number,
                "total_rounds": game.total_rounds,
                "round_data": public,
                "scores": gs["scores"],
                "ends_in": game.round_time,
                "ends_at": gs["round_ends_at"],
            },
        ),
    )

    # Auto-resolve if the round timer expires.
    _schedule(
        room_id,
        game.round_time,
        lambda: _on_timeout(room_id, round_number),
    )


async def _on_timeout(room_id: str, round_number: int) -> None:
    async with rooms.room_lock(room_id):
        room = await rooms.get_room(room_id)
        if room is None or room.get("game") is None:
            return
        gs = room["game"]
        # Guard: only the still-active matching round may be timed out.
        if gs["round"] != round_number or gs["phase"] != "active":
            return
        await _finish_round_locked(room, winner_id=None, timed_out=True)


async def handle_action(
    room_id: str, player_id: str, action: dict[str, Any]
) -> None:
    async with rooms.room_lock(room_id):
        room = await rooms.get_room(room_id)
        if room is None or room.get("game") is None:
            return
        game = get_game(room["game_type"])
        if game is None:
            return
        gs = room["game"]
        if gs["phase"] != "active":
            return  # round not accepting input
        if rooms.find_player(room, player_id) is None:
            return  # not a participant

        public = gs["round_data"]
        secret = gs["round_secret"]

        if game.mode == RACE:
            # A player locked out (prior wrong discrete pick) can't act again.
            prior = gs["round_actions"].get(player_id)
            if prior == "locked":
                return

            correct = game.check(public, secret, action)
            if correct:
                # The room lock makes "first correct wins" deterministic even
                # when both sockets submit in the same event-loop tick.
                gs["scores"][player_id] = (
                    gs["scores"].get(player_id, 0) + game.points_per_round
                )
                await rooms.save_room(room)
                await manager.broadcast(
                    room_id,
                    events.message(
                        events.PLAYER_ACTION,
                        {"player_id": player_id, "correct": True},
                    ),
                )
                await _finish_round_locked(room, winner_id=player_id)
                return

            # Wrong option picks lock the player out for the round.
            is_discrete = "choice" in action or "code" in action
            if is_discrete:
                gs["round_actions"][player_id] = "locked"
                await rooms.save_room(room)
            await manager.send(
                room_id,
                player_id,
                events.message(
                    events.PLAYER_ACTION,
                    {"player_id": player_id, "correct": False, "locked": is_discrete},
                ),
            )
            # If every player has locked themselves out, end early. Disconnected
            # players still count, so a brief mobile drop does not forfeit them.
            participants = _participant_ids(room)
            if participants and all(
                gs["round_actions"].get(pid) == "locked" for pid in participants
            ):
                await _finish_round_locked(room, winner_id=None)
            return

        # --- simultaneous mode ---
        if player_id in gs["round_actions"]:
            return  # immutable: refresh/reconnect cannot improve a submitted guess
        gs["round_actions"][player_id] = action
        await rooms.save_room(room)
        # Let the opponent know a guess landed, without revealing it.
        await manager.broadcast(
            room_id,
            events.message(
                events.PLAYER_ACTION,
                {"player_id": player_id, "submitted": True},
            ),
            exclude=player_id,
        )
        participants = _participant_ids(room)
        if participants and all(pid in gs["round_actions"] for pid in participants):
            await _finish_round_locked(room, winner_id=None)


async def _finish_round(
    room: dict[str, Any], *, winner_id: str | None, timed_out: bool = False
) -> None:
    async with rooms.room_lock(room["id"]):
        current = await rooms.get_room(room["id"])
        if current is None or current.get("game") is None:
            return
        await _finish_round_locked(current, winner_id=winner_id, timed_out=timed_out)


async def _finish_round_locked(
    room: dict[str, Any], *, winner_id: str | None, timed_out: bool = False
) -> None:
    room_id = room["id"]
    _cancel_timer(room_id)
    game = get_game(room["game_type"])
    gs = room["game"]
    if gs["phase"] != "active":
        return
    public = gs["round_data"]
    secret = gs["round_secret"]
    round_number = gs["round"]

    if game.mode == RACE:
        actions = {}
        points = {pid: 0 for pid in gs["scores"]}
        if winner_id is not None:
            points[winner_id] = game.points_per_round
        # scores already credited at handle_action time for the winner
    else:
        actions = {
            pid: a for pid, a in gs["round_actions"].items() if isinstance(a, dict)
        }
        points = game.resolve(public, secret, actions)
        for pid, pts in points.items():
            gs["scores"][pid] = gs["scores"].get(pid, 0) + pts

    answer = game.reveal(public, secret)
    details = game.result_details(public, secret, actions, points)
    if details:
        answer = {**answer, **details}

    result = {
        "round": round_number,
        "round_points": points,
        "scores": gs["scores"],
        "answer": answer,
        "winner_id": winner_id,
        "timed_out": timed_out,
    }

    gs["history"].append({"round": round_number, "points": points})
    gs["phase"] = "round_over"
    gs["last_result"] = result
    await rooms.save_room(room)

    await manager.broadcast(
        room_id,
        events.message(events.ROUND_RESULT, result),
    )

    if round_number >= game.total_rounds:
        logger.info("room %s: round %s final -> scheduling end_game", room_id, round_number)
        _schedule(room_id, game.result_delay, lambda: end_game(room_id))
    else:
        logger.info("room %s: round %s done -> scheduling round %s", room_id, round_number, round_number + 1)
        _schedule(
            room_id, game.result_delay, lambda: start_round(room_id, round_number + 1)
        )


# --------------------------------------------------------------------------- #
# Game end + persistence
# --------------------------------------------------------------------------- #

async def end_game(room_id: str) -> None:
    logger.info("room %s: end_game START", room_id)
    _cancel_timer(room_id)
    async with rooms.room_lock(room_id):
        room = await rooms.get_room(room_id)
        if room is None or room.get("game") is None:
            return
        gs = room["game"]
        scores = gs["scores"]
        room["status"] = "finished"
        gs["phase"] = "finished"
        # Clear ready flags so a rematch starts clean.
        for p in room["players"]:
            p["ready"] = False
        await rooms.save_room(room)

    winner_id = _decide_winner(scores)

    await manager.broadcast(
        room_id,
        events.message(
            events.GAME_END,
            {
                "scores": scores,
                "winner_id": winner_id,
                "history": gs["history"],
                "players": room["players"],
            },
        ),
    )

    try:
        await _persist_game(room, winner_id)
    except Exception:  # noqa: BLE001 - persistence must never break the game
        logger.exception("failed to persist game session for room %s", room_id)


def _decide_winner(scores: dict[str, int]) -> str | None:
    if not scores:
        return None
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    if len(ranked) >= 2 and ranked[0][1] == ranked[1][1]:
        return None  # draw
    return ranked[0][0]


async def _persist_game(room: dict[str, Any], winner_id: str | None) -> None:
    from sqlalchemy import select

    from app.core.database import AsyncSessionLocal
    from app.models import GameSession, User

    players = room["players"]
    gs = room["game"]
    scores = gs["scores"]
    p1 = players[0]
    p2 = players[1] if len(players) > 1 else None

    # Build round-by-round breakdown for the score card.
    rounds = [
        {
            "round": h["round"],
            "p1": h["points"].get(p1["id"], 0),
            "p2": h["points"].get(p2["id"], 0) if p2 else 0,
        }
        for h in gs["history"]
    ]

    async with AsyncSessionLocal() as db:
        session = GameSession(
            room_id=room["id"],
            game_type=room["game_type"],
            player1_id=p1["id"],
            player1_handle=p1["handle"],
            player2_id=p2["id"] if p2 else None,
            player2_handle=p2["handle"] if p2 else None,
            player1_score=scores.get(p1["id"], 0),
            player2_score=scores.get(p2["id"], 0) if p2 else 0,
            winner_id=winner_id,
            rounds=rounds,
        )
        db.add(session)

        # Update aggregate stats for any Bluesky (non-guest) players.
        for p in players:
            if p.get("is_guest"):
                continue
            user = await db.get(User, p["id"])
            if user is None:
                continue
            user.games_played += 1
            user.total_score += scores.get(p["id"], 0)
            if winner_id == p["id"]:
                user.games_won += 1

        await db.commit()
