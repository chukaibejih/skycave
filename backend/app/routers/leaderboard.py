"""Public leaderboard — top players, all-time or this week.

  - all   : denormalized User.total_score (single indexed ORDER BY, cheapest).
  - week  : aggregated from game_sessions in the last 7 days (both player sides
            unioned, grouped by DID) — uses the created_at index.

Both are cached in Redis with a short TTL, so the landing/leaderboard pages hit
Postgres at most once per TTL regardless of traffic. Stats update on game-end;
the board catches up within one TTL (no explicit invalidation).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, desc, func, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis_client import get_redis
from app.models import GameSession, User
from app.schemas.rest import LeaderboardEntry, LeaderboardResponse

router = APIRouter(tags=["leaderboard"])

CACHE_PREFIX = "leaderboard:v2"
CACHE_TTL = 60  # seconds
WEEK = timedelta(days=7)


@router.get("/leaderboard", response_model=LeaderboardResponse)
async def leaderboard(
    db: AsyncSession = Depends(get_db),
    period: str = Query("all", pattern="^(all|week)$"),
    limit: int = Query(10, ge=1, le=50),
) -> LeaderboardResponse:
    r = get_redis()
    key = f"{CACHE_PREFIX}:{period}:{limit}"

    cached = await r.get(key)
    if cached:
        return LeaderboardResponse.model_validate_json(cached)

    resp = (
        await _week(db, limit) if period == "week" else await _all_time(db, limit)
    )
    await r.set(key, resp.model_dump_json(), ex=CACHE_TTL)
    return resp


async def _all_time(db: AsyncSession, limit: int) -> LeaderboardResponse:
    rows = (
        await db.execute(
            select(User)
            .where(User.games_played > 0)
            .order_by(desc(User.total_score), desc(User.games_won))
            .limit(limit)
        )
    ).scalars().all()
    return LeaderboardResponse(
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


async def _week(db: AsyncSession, limit: int) -> LeaderboardResponse:
    since = datetime.now(timezone.utc) - WEEK

    # Each game contributes two rows (player1, player2); keep only Bluesky users
    # (DIDs) — guests have ephemeral ids and can't accumulate a ranking.
    def side(pid_col, handle_col, score_col):
        return select(
            pid_col.label("pid"),
            handle_col.label("handle"),
            score_col.label("score"),
            case((GameSession.winner_id == pid_col, 1), else_=0).label("won"),
        ).where(GameSession.created_at >= since, pid_col.like("did:%"))

    plays = union_all(
        side(GameSession.player1_id, GameSession.player1_handle, GameSession.player1_score),
        side(GameSession.player2_id, GameSession.player2_handle, GameSession.player2_score),
    ).subquery()

    agg = (
        select(
            plays.c.pid,
            func.max(plays.c.handle).label("handle"),
            func.sum(plays.c.score).label("total"),
            func.count().label("played"),
            func.sum(plays.c.won).label("won"),
        )
        .group_by(plays.c.pid)
        .order_by(desc("total"), desc("won"))
        .limit(limit)
    )
    rows = (await db.execute(agg)).all()

    # Enrich with current profile (display name + avatar) in one query.
    pids = [row.pid for row in rows]
    users = {
        u.did: u
        for u in (
            await db.execute(select(User).where(User.did.in_(pids)))
        ).scalars()
    } if pids else {}

    entries = []
    for i, row in enumerate(rows):
        u = users.get(row.pid)
        played = int(row.played or 0)
        won = int(row.won or 0)
        entries.append(
            LeaderboardEntry(
                rank=i + 1,
                did=row.pid,
                handle=(u.handle if u else row.handle),
                display_name=(u.display_name if u else None),
                avatar_url=(u.avatar_url if u else None),
                games_played=played,
                games_won=won,
                total_score=int(row.total or 0),
                win_rate=round(won / played, 3) if played else 0.0,
            )
        )
    return LeaderboardResponse(entries=entries)
