from fastapi import APIRouter, Response

from app.games.registry import all_games
from app.schemas.rest import GameInfo

router = APIRouter(tags=["games"])

# The game catalog is static per deploy — build the payload once at import so
# each request just serializes a cached list instead of rebuilding it.
#
# Newest game first: the registry is maintained in launch order (new games are
# appended), so reversing it puts the latest release at the top of the hub and
# keeps it that way without a per-game date to maintain.
_GAMES: list[GameInfo] = [
    GameInfo(
        type=g.type,
        name=g.name,
        tagline=g.tagline,
        total_rounds=g.total_rounds,
        mode=g.mode,
    )
    for g in reversed(all_games())
]


@router.get("/games", response_model=list[GameInfo])
async def list_games(response: Response) -> list[GameInfo]:
    # Let browsers/CDN cache it; it only changes on redeploy.
    response.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=3600"
    return _GAMES
