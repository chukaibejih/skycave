"""WebSocket endpoint: room connection, lifecycle events, reconnection.

URL: ``/ws/{room_id}?token=<jwt>``

On connect we authenticate the JWT, register the socket, mark the player
connected in Redis, send a full ROOM_STATE snapshot (so a refresh/reconnect
rehydrates the in-progress game), and tell everyone else PLAYER_JOINED. Then we
pump client messages (READY / ACTION / REMATCH_REQUEST) into the game engine.
"""
from __future__ import annotations

import logging

from fastapi import WebSocket, WebSocketDisconnect

from app.core.deps import identity_from_token
from app.services import game_engine, room_expiry, room_manager as rooms
from app.websocket import events
from app.websocket.manager import manager

logger = logging.getLogger("skycave.ws")


def _public_room(room: dict, player_id: str) -> dict:
    """Strip server-only secrets (the current round's answer) before sending."""
    safe = {
        "id": room["id"],
        "game_type": room["game_type"],
        "mode": room.get("mode", "versus"),
        "status": room["status"],
        "host_id": room["host_id"],
        "host_handle": room["host_handle"],
        "players": room["players"],
        "expires_at": room.get("expires_at"),
        "series": room.get("series", {}),
        "game": None,
    }
    game = room.get("game")
    if game is not None:
        prior = game.get("round_actions", {}).get(player_id)
        safe["game"] = {
            "game_type": game["game_type"],
            "total_rounds": game["total_rounds"],
            "mode": game["mode"],
            "round": game["round"],
            "phase": game["phase"],
            "scores": game["scores"],
            "history": game["history"],
            # Keep public round data through round_over so reconnecting during
            # the reveal window does not land on a blank game screen.
            "round_data": game["round_data"]
            if game["phase"] in ("active", "round_over")
            else None,
            "round_ends_at": game.get("round_ends_at"),
            "last_result": game.get("last_result"),
            "solo_summary": game.get("solo_summary"),
            "winner_id": game.get("winner_id"),  # keep the result on rehydrate
            "my_round_state": {
                "locked": prior == "locked",
                "submitted": prior is not None,
            },
        }
    # Turn-based board (Tile Takeover) — carry it so a reconnect rehydrates.
    if game is not None and game.get("turn_state"):
        from app.games.registry import get_game

        g = get_game(room["game_type"])
        if g is not None:
            safe["board"] = g.turn_public(game["turn_state"])
    return safe


async def websocket_endpoint(ws: WebSocket, room_id: str, token: str | None) -> None:
    identity = identity_from_token(token)
    if identity is None:
        await ws.close(code=4401)  # unauthorized
        return

    room = await rooms.get_room(room_id)
    if room is None:
        await ws.close(code=4404)  # room not found
        return
    # A room whose join window elapsed while nobody was connected: reflect the
    # expired status in the snapshot below so a late connector sees it too.
    room = await room_expiry.ensure_fresh(room)

    # Must already be a member (joined via REST POST /rooms or /rooms/{id}/join).
    if rooms.find_player(room, identity.id) is None:
        room, join_status = await rooms.join_room(room_id, identity.model_dump())
        if join_status in ("full", "not_found"):
            await manager_close(ws, 4403)
            return

    player_id = identity.id
    await manager.connect(room_id, player_id, ws)
    room = await rooms.set_connected(room_id, player_id, True)

    # 1) Snapshot for state recovery on (re)connect.
    await manager.send(room_id, player_id, events.message(
        events.ROOM_STATE, _public_room(room, player_id)
    ))
    # 2) Notify others.
    await manager.broadcast(
        room_id,
        events.message(events.PLAYER_JOINED, {
            "player": rooms.find_player(room, player_id),
            "players": room["players"],
        }),
        exclude=player_id,
    )

    try:
        while True:
            raw = await ws.receive_json()
            await _handle_client_message(room_id, player_id, raw)
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        logger.exception("ws error in room %s for %s", room_id, player_id)
    finally:
        manager.disconnect(room_id, player_id, ws)
        # Mark disconnected only if no fresh socket took over (reconnect race).
        if not manager.is_connected(room_id, player_id):
            await rooms.set_connected(room_id, player_id, False)
            await manager.broadcast(
                room_id,
                events.message(events.PLAYER_DISCONNECTED, {"player_id": player_id}),
            )


async def manager_close(ws: WebSocket, code: int) -> None:
    await ws.accept()
    await ws.close(code=code)


async def _handle_client_message(room_id: str, player_id: str, raw: dict) -> None:
    msg_type = raw.get("type")
    data = raw.get("data") or {}

    if msg_type == events.READY:
        await _handle_ready(room_id, player_id)
    elif msg_type == events.ACTION:
        await game_engine.handle_action(room_id, player_id, data)
    elif msg_type == events.REMATCH_REQUEST:
        await _handle_rematch(room_id, player_id)
    else:
        await manager.send(room_id, player_id, events.message(
            events.ERROR, {"message": f"unknown event: {msg_type}"}
        ))


async def _handle_ready(room_id: str, player_id: str) -> None:
    room = await rooms.set_ready(room_id, player_id, True)
    if room is None:
        return
    await manager.broadcast(room_id, events.message(
        events.PLAYER_JOINED, {"players": room["players"]}
    ))
    # Solo starts with the lone player; versus waits for both. Either way, every
    # present player must be ready and the room must still be waiting.
    min_players = 1 if room.get("mode") == "solo" else 2
    if (
        len(room["players"]) >= min_players
        and all(p["ready"] for p in room["players"])
        and room["status"] == "waiting"
    ):
        await game_engine.start_game(room_id)


async def _handle_rematch(room_id: str, player_id: str) -> None:
    room = await rooms.set_ready(room_id, player_id, True)
    if room is None:
        return
    await manager.broadcast(room_id, events.message(
        events.REMATCH_REQUEST, {"player_id": player_id, "players": room["players"]}
    ))
    # Both players opted in -> reset to a fresh waiting room and restart.
    if room["status"] == "finished" and all(p["ready"] for p in room["players"]):
        await rooms.set_status(room_id, "waiting")
        await rooms.set_game(room_id, None)
        await game_engine.start_game(room_id)
