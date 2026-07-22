"""Canonical WebSocket event names + payload helpers.

This protocol is mirrored on the frontend in lib/websocket.ts - keep the two
in sync. Every message on the wire is JSON: {"type": <EVENT>, "data": {...}}.
"""
from typing import Any


# --- Server -> Client ---
PLAYER_JOINED = "PLAYER_JOINED"
GAME_START = "GAME_START"
ROUND_START = "ROUND_START"
PLAYER_ACTION = "PLAYER_ACTION"          # someone acted (feedback / opponent submitted)
ROUND_RESULT = "ROUND_RESULT"
GAME_END = "GAME_END"
PLAYER_DISCONNECTED = "PLAYER_DISCONNECTED"
ROOM_STATE = "ROOM_STATE"                # full snapshot, sent on (re)connect for recovery
GAME_STATE = "GAME_STATE"                # turn-based board update (Tile Takeover)
ROOM_EXPIRED = "ROOM_EXPIRED"            # waiting room closed (no opponent joined in time)
ERROR = "ERROR"

# --- Client -> Server ---
READY = "READY"
ACTION = "ACTION"                        # tap / answer / buzz
REMATCH_REQUEST = "REMATCH_REQUEST"


def message(event: str, data: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"type": event, "data": data or {}}
