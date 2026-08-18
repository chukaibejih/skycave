"""Track how long players have continuously held leaderboard ranks 1-3."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GameSession, LeaderboardPosition, PersonalBest


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
