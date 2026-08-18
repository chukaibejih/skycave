"""Track how long players have continuously held leaderboard ranks 1-3."""
from __future__ import annotations

import heapq
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GameSession, LeaderboardPosition, PersonalBest


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


async def _open(db: AsyncSession, game: str, mode: str, period: str, rank: int):
    return (
        await db.execute(
            select(LeaderboardPosition)
            .where(
                LeaderboardPosition.game_type == game,
                LeaderboardPosition.mode == mode,
                LeaderboardPosition.period == period,
                LeaderboardPosition.rank == rank,
                LeaderboardPosition.ended_at.is_(None),
            )
            .limit(1)
        )
    ).scalars().first()


async def _board(db: AsyncSession, game: str, mode: str, period: str):
    # Lazy import avoids making the leaderboard router depend on this service at import time.
    from app.routers import leaderboard

    if mode == "solo":
        return (await leaderboard._solo(db, game, 3)).entries
    if mode == "total":
        return (await leaderboard._total(db, game, period, 3)).entries
    return (await leaderboard._versus(db, game, period, 3)).entries


async def reconcile(db: AsyncSession, game: str, *, commit: bool = True) -> None:
    """Update current top-three position spells after standings may have moved."""
    now = datetime.now(timezone.utc)
    scopes = (
        ("solo", "all"),
        ("versus", "all"),
        ("versus", "week"),
        ("total", "all"),
        ("total", "week"),
    )
    for mode, period in scopes:
        entries = await _board(db, game, mode, period)
        by_rank = {entry.rank: entry.did for entry in entries}
        for rank in range(1, 4):
            current = await _open(db, game, mode, period, rank)
            holder = by_rank.get(rank)
            if current is not None and current.holder_did == holder:
                continue
            if current is not None:
                current.ended_at = now
            if holder is not None:
                db.add(
                    LeaderboardPosition(
                        game_type=game,
                        mode=mode,
                        period=period,
                        rank=rank,
                        holder_did=holder,
                        started_at=now,
                    )
                )
    if commit:
        await db.commit()


async def seed_existing(db: AsyncSession) -> None:
    """Start tracking the current top three for boards that predate this feature."""
    session_games = (await db.execute(select(GameSession.game_type).distinct())).scalars().all()
    solo_games = (await db.execute(select(PersonalBest.game_type).distinct())).scalars().all()
    for game in set(session_games) | set(solo_games):
        await reconcile(db, game, commit=False)
    await db.commit()


async def rebuild_solo(db: AsyncSession, *, commit: bool = True) -> int:
    """Reconstruct REAL top-3 tenure for every solo board from game_sessions, so
    the current holders' "held since" reflects the actual history rather than the
    seed time.

    Replays each board's score history in order, tracking the top three in the
    same order the live board uses (best desc, plays asc, did asc), and keeps only
    the current (open) spell per rank - whose ``started_at`` is the true tenure
    start. Replaces the solo/all positions only; versus/total scopes (and the
    rolling weekly windows, where a fixed tenure is meaningless) are left as-is.
    """
    from app.games.registry import get_game
    from app.models.game_session import SINGLE_PLAYER_MODES

    await db.execute(
        delete(LeaderboardPosition).where(
            LeaderboardPosition.mode == "solo", LeaderboardPosition.period == "all"
        )
    )
    not_guest = GameSession.player1_id.notlike("guest:%")
    games = (
        await db.execute(
            select(GameSession.game_type)
            .where(GameSession.mode.in_(SINGLE_PLAYER_MODES), not_guest)
            .distinct()
        )
    ).scalars().all()

    total = 0
    for game in games:
        g = get_game(game)
        if g is None:
            continue
        wins_board = getattr(g, "solo_leaderboard", "best") == "wins"
        rows = (
            await db.execute(
                select(
                    GameSession.player1_id,
                    GameSession.player1_score,
                    GameSession.created_at,
                )
                .where(
                    GameSession.game_type == game,
                    GameSession.mode.in_(SINGLE_PLAYER_MODES),
                    not_guest,
                )
                .order_by(GameSession.created_at.asc())
            )
        ).all()

        best: dict[str, int] = {}   # pid -> best_score (max) or career wins (cumulative)
        plays: dict[str, int] = {}  # pid -> solo plays so far
        open_pos: dict[int, LeaderboardPosition] = {}  # rank -> current open spell
        for pid, raw, ts in rows:
            score = raw or 0
            plays[pid] = plays.get(pid, 0) + 1
            if wins_board:
                best[pid] = best.get(pid, 0) + (1 if score > 0 else 0)
            else:
                best[pid] = max(best.get(pid, 0), score)
            # the top three, in the live board's exact order
            top = heapq.nsmallest(3, best, key=lambda p: (-best[p], plays[p], p))
            at = _aware(ts)
            for rank in (1, 2, 3):
                holder = top[rank - 1] if rank - 1 < len(top) else None
                cur = open_pos.get(rank)
                if cur is not None and cur.holder_did == holder:
                    continue
                if cur is not None:
                    open_pos.pop(rank, None)  # closed spell - history isn't stored
                if holder is not None:
                    open_pos[rank] = LeaderboardPosition(
                        game_type=game,
                        mode="solo",
                        period="all",
                        rank=rank,
                        holder_did=holder,
                        started_at=at,
                    )
        for pos in open_pos.values():
            db.add(pos)
            total += 1
    if commit:
        await db.commit()
    return total
