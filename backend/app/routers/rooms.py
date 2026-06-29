from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentIdentity
from app.core.ids import new_room_id
from app.games.registry import get_game
from app.models import Room
from app.schemas.rest import (
    CreateRoomRequest,
    GameSummary,
    JoinRoomResponse,
    PlayerSlot,
    RoomResponse,
)
from app.services import room_manager as rooms
from app.services.sharing import invite_url

router = APIRouter(prefix="/rooms", tags=["rooms"])


def _to_response(room: dict, game_name: str) -> RoomResponse:
    game = room.get("game")
    summary = (
        GameSummary(
            game_type=game["game_type"],
            total_rounds=game["total_rounds"],
            mode=game["mode"],
            round=game["round"],
            phase=game["phase"],
            scores=game["scores"],
            history=game["history"],
            round_data=game["round_data"]
            if game["phase"] in ("active", "round_over")
            else None,
            round_ends_at=game.get("round_ends_at"),
            last_result=game.get("last_result"),
            solo_summary=game.get("solo_summary"),
        )
        if game
        else None
    )
    return RoomResponse(
        id=room["id"],
        game_type=room["game_type"],
        game_name=game_name,
        mode=room.get("mode", "versus"),
        status=room["status"],
        host_id=room["host_id"],
        host_handle=room["host_handle"],
        players=[PlayerSlot(**p) for p in room["players"]],
        invite_url=invite_url(room["id"]),
        game=summary,
    )


@router.post("", response_model=RoomResponse)
async def create_room(
    body: CreateRoomRequest,
    identity: CurrentIdentity,
    db: AsyncSession = Depends(get_db),
) -> RoomResponse:
    game = get_game(body.game_type)
    if game is None:
        raise HTTPException(status_code=400, detail="Unknown game type")
    mode = body.mode if body.mode in ("versus", "solo") else "versus"

    # Generate a unique room id (retry on the rare collision).
    for _ in range(5):
        room_id = new_room_id()
        if await rooms.get_room(room_id) is None:
            break
    else:
        raise HTTPException(status_code=500, detail="Could not allocate room id")

    await rooms.create_room(room_id, body.game_type, identity.model_dump(), mode=mode)

    # Persist the durable anchor (for invite-link OG preview + history).
    db.add(
        Room(
            id=room_id,
            game_type=body.game_type,
            status="waiting",
            host_id=identity.id,
            host_handle=identity.handle,
        )
    )
    await db.commit()

    room = await rooms.get_room(room_id)
    return _to_response(room, game.name)


@router.get("/{room_id}", response_model=RoomResponse)
async def get_room(room_id: str) -> RoomResponse:
    room = await rooms.get_room(room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    game = get_game(room["game_type"])
    return _to_response(room, game.name if game else room["game_type"])


@router.post("/{room_id}/join", response_model=JoinRoomResponse)
async def join_room(room_id: str, identity: CurrentIdentity) -> JoinRoomResponse:
    room, status = await rooms.join_room(room_id, identity.model_dump())
    if status == "not_found":
        raise HTTPException(status_code=404, detail="Room not found")
    if status == "full":
        raise HTTPException(status_code=409, detail="Room is full")

    game = get_game(room["game_type"])
    you = rooms.find_player(room, identity.id)
    return JoinRoomResponse(
        room=_to_response(room, game.name if game else room["game_type"]),
        you=PlayerSlot(**you),
    )
