from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.games.registry import get_game
from app.schemas.rest import ScorecardRequest, ScorecardResponse
from app.services import room_manager as rooms
from app.services.sharing import compose_intent, invite_text, scorecard_text

router = APIRouter(prefix="/share", tags=["share"])


@router.post("/scorecard", response_model=ScorecardResponse)
async def scorecard(body: ScorecardRequest) -> ScorecardResponse:
    room = await rooms.get_room(body.room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    game = get_game(room["game_type"])
    game_name = game.name if game else room["game_type"]

    gs = room.get("game")
    players = room["players"]
    if gs is None or len(players) < 2:
        raise HTTPException(status_code=400, detail="No completed game to share")

    p1, p2 = players[0], players[1]
    scores = gs["scores"]
    text = scorecard_text(
        game_name,
        p1["display_name"],
        scores.get(p1["id"], 0),
        p2["display_name"],
        scores.get(p2["id"], 0),
        room["id"],
    )
    # image_url is Phase 2 (R2 / Playwright OG image generation).
    return ScorecardResponse(text=text, intent_url=compose_intent(text), image_url=None)


@router.get("/invite/{room_id}", response_model=ScorecardResponse)
async def invite(room_id: str) -> ScorecardResponse:
    room = await rooms.get_room(room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    game = get_game(room["game_type"])
    game_name = game.name if game else room["game_type"]
    text = invite_text(game_name, room_id)
    return ScorecardResponse(text=text, intent_url=compose_intent(text), image_url=None)
