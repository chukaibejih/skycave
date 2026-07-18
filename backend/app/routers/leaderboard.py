"""Public leaderboard — per game, 1v1 or solo.

Scores aren't comparable across games (a GeoGuess distance score dwarfs a
Color Clash count), so every board is scoped to a single game:

  - versus : aggregated from game_sessions for that game (both player sides
             unioned, grouped by DID), ranked by wins then score. Supports an
             all-time or last-7-days window.
  - solo   : best score for that game from personal_bests (all-time; only the
             best is stored, so there's no weekly window).

Everything is denormalized (stats written at game-end) + Redis-cached per
(mode, game, period), so reads are a single indexed query hit at most once per
TTL — no runtime cross-game aggregation.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, desc, func, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis_client import get_redis
from app.games.registry import get_game
from app.models import GameSession, PersonalBest, User
from app.schemas.rest import LeaderboardEntry, LeaderboardResponse

router = APIRouter(tags=["leaderboard"])

CACHE_PREFIX = "leaderboard:v3"
CACHE_TTL = 60  # seconds
WEEK = timedelta(days=7)


@router.get("/leaderboard", response_model=LeaderboardResponse)
async def leaderboard(
    db: AsyncSession = Depends(get_db),
    game: str = Query(...),
    mode: str = Query("versus", pattern="^(versus|solo|total)$"),
    period: str = Query("all", pattern="^(all|week)$"),
    limit: int = Query(10, ge=1, le=50),
) -> LeaderboardResponse:
    if get_game(game) is None:
        return LeaderboardResponse(entries=[])
    if mode == "solo":
        period = "all"  # only best scores are stored — no weekly window

    r = get_redis()
    key = f"{CACHE_PREFIX}:{mode}:{game}:{period}:{limit}"
    cached = await r.get(key)
    if cached:
        return LeaderboardResponse.model_validate_json(cached)

    if mode == "solo":
        resp = await _solo(db, game, limit)
    elif mode == "total":
        resp = await _total(db, game, period, limit)
    else:
        resp = await _versus(db, game, period, limit)
    await r.set(key, resp.model_dump_json(), ex=CACHE_TTL)
    return resp


async def _users_by_did(db: AsyncSession, dids: list[str]) -> dict[str, User]:
    if not dids:
        return {}
    return {
        u.did: u
        for u in (await db.execute(select(User).where(User.did.in_(dids)))).scalars()
    }


async def _aggregate(
    db: AsyncSession, conds: list, order_by: list, limit: int
) -> LeaderboardResponse:
    """Union both player sides of game_sessions, group by DID, rank by `order_by`."""

    def side(pid_col, handle_col, score_col):
        return select(
            pid_col.label("pid"),
            handle_col.label("handle"),
            score_col.label("score"),
            case((GameSession.winner_id == pid_col, 1), else_=0).label("won"),
        ).where(*conds, pid_col.like("did:%"))  # Bluesky users only (guests excluded)

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
        .order_by(*order_by)
        .limit(limit)
    )
    rows = (await db.execute(agg)).all()
    users = await _users_by_did(db, [row.pid for row in rows])

    entries = []
    for i, row in enumerate(rows):
        u = users.get(row.pid)
        played, won = int(row.played or 0), int(row.won or 0)
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


async def _versus(db: AsyncSession, game: str, period: str, limit: int) -> LeaderboardResponse:
    conds = [GameSession.game_type == game, GameSession.mode == "versus"]
    if period == "week":
        conds.append(GameSession.created_at >= datetime.now(timezone.utc) - WEEK)
    # wins first, cumulative score breaks ties
    return await _aggregate(db, conds, [desc("won"), desc("total")], limit)


async def _total(db: AsyncSession, game: str, period: str, limit: int) -> LeaderboardResponse:
    """Cumulative points for a game across EVERY mode — solo, daily and 1v1 all
    add up. Used by games like Clay where each play should grow one running
    total rather than compete on a single best run or on wins."""
    conds = [GameSession.game_type == game]
    if period == "week":
        conds.append(GameSession.created_at >= datetime.now(timezone.utc) - WEEK)
    return await _aggregate(db, conds, [desc("total")], limit)


async def _solo(db: AsyncSession, game: str, limit: int) -> LeaderboardResponse:
    rows = (
        await db.execute(
            select(PersonalBest)
            .where(PersonalBest.game_type == game)
            .order_by(desc(PersonalBest.best_score))
            .limit(limit)
        )
    ).scalars().all()
    users = await _users_by_did(db, [pb.player_id for pb in rows])

    entries = []
    for i, pb in enumerate(rows):
        u = users.get(pb.player_id)
        entries.append(
            LeaderboardEntry(
                rank=i + 1,
                did=pb.player_id,
                handle=(u.handle if u else pb.player_id),
                display_name=(u.display_name if u else None),
                avatar_url=(u.avatar_url if u else None),
                games_played=pb.plays,
                games_won=0,  # not meaningful for solo
                total_score=pb.best_score,  # best single-run score
                win_rate=0.0,
            )
        )
    return LeaderboardResponse(entries=entries)
