from fastapi import APIRouter

from app.games.registry import all_games
from app.schemas.rest import GameInfo

router = APIRouter(tags=["games"])


@router.get("/games", response_model=list[GameInfo])
async def list_games() -> list[GameInfo]:
    return [
        GameInfo(
            type=g.type,
            name=g.name,
            tagline=g.tagline,
            total_rounds=g.total_rounds,
            mode=g.mode,
        )
        for g in all_games()
    ]
