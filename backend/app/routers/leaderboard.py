"""Public leaderboard — top players by cumulative score.

Optimized for the landing page (highest-traffic route):
  - the User table is denormalized (games_played/won/total_score), so this is a
    single indexed ORDER BY ... LIMIT with no joins;
  - results are cached in Redis with a short TTL, so Postgres is hit at most
    once per TTL regardless of how many visitors load the page. Stats update on
    game-end; the board catches up within one TTL (no explicit invalidation).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis_client import get_redis
from app.models import User
from app.schemas.rest import LeaderboardEntry, LeaderboardResponse

router = APIRouter(tags=["leaderboard"])

CACHE_PREFIX = "leaderboard:v1"
CACHE_TTL = 60  # seconds


@router.get("/leaderboard", response_model=LeaderboardResponse)
async def leaderboard(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(10, ge=1, le=50),
) -> LeaderboardResponse:
    r = get_redis()
    key = f"{CACHE_PREFIX}:{limit}"

    cached = await r.get(key)
    if cached:
        return LeaderboardResponse.model_validate_json(cached)

    rows = (
        await db.execute(
            select(User)
            .where(User.games_played > 0)
            .order_by(desc(User.total_score), desc(User.games_won))
            .limit(limit)
        )
    ).scalars().all()

    resp = LeaderboardResponse(
        entries=[
            LeaderboardEntry(
                rank=i + 1,
                did=u.did,
                handle=u.handle,
                display_name=u.display_name,
                avatar_url=u.avatar_url,
                games_played=u.games_played,
                games_won=u.games_won,
                total_score=u.total_score,
                win_rate=round(u.games_won / u.games_played, 3) if u.games_played else 0.0,
            )
            for i, u in enumerate(rows)
        ]
    )
    await r.set(key, resp.model_dump_json(), ex=CACHE_TTL)
    return resp
