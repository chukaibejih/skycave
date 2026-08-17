"""Solo leaderboard #1 reigns - who has held the top spot, and for how long.

A reign is one continuous spell at #1 on a solo board. ``reconcile`` runs after
every solo personal-best write: it opens a reign for a new #1, closes the
previous one when someone is overtaken, and no-ops while the same player still
leads. ``longest`` ranks reigns by duration for the Hall of Fame. ``seed``
backfills a reign for each current champ (one-off), backdated to when their score
was set so the ongoing reign is credited its full length.

Reigns are tracked for SOLO boards only: those rank an all-time best, so #1 is a
stable thing to reign over. The versus boards are a rolling 7-day window, where
"#1" churns by the day and a reign would be meaningless.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LeaderboardReign, PersonalBest

# The exact deterministic sort the solo leaderboard uses, so "who is #1" here can
# never disagree with what players see on the board.
_TOP_SORT = (
    desc(PersonalBest.best_score),
    PersonalBest.plays.asc(),
    PersonalBest.player_id.asc(),
)


def _aware(dt: datetime) -> datetime:
    """Treat a naive timestamp as UTC (sqlite in tests can hand one back)."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


async def _current_top(db: AsyncSession, game: str) -> PersonalBest | None:
    return (
        await db.execute(
            select(PersonalBest)
            .where(PersonalBest.game_type == game)
            .order_by(*_TOP_SORT)
            .limit(1)
        )
    ).scalars().first()


async def _open_reign(db: AsyncSession, game: str) -> LeaderboardReign | None:
    return (
        await db.execute(
            select(LeaderboardReign)
            .where(LeaderboardReign.game_type == game, LeaderboardReign.ended_at.is_(None))
            .order_by(desc(LeaderboardReign.started_at))
            .limit(1)
        )
    ).scalars().first()


async def reconcile(db: AsyncSession, game: str, *, commit: bool = True) -> None:
    """Bring the open reign for a solo game in line with its current #1.

    Opens a reign when there is a new leader, closes the old one when the leader
    changed, and does nothing while the same player still holds #1 (only
    refreshing the recorded score when the champ improves it). Safe to call after
    any solo PB write; a no-op is cheap.
    """
    top = await _current_top(db, game)
    if top is None:
        return
    now = datetime.now(timezone.utc)
    open_r = await _open_reign(db, game)
    if open_r is None:
        db.add(
            LeaderboardReign(
                game_type=game, holder_did=top.player_id, best_score=top.best_score, started_at=now
            )
        )
    elif open_r.holder_did != top.player_id:
        open_r.ended_at = now
        db.add(
            LeaderboardReign(
                game_type=game, holder_did=top.player_id, best_score=top.best_score, started_at=now
            )
        )
    elif open_r.best_score != top.best_score:
        open_r.best_score = top.best_score  # same champ, improved their own record
    if commit:
        await db.commit()


async def seed(db: AsyncSession) -> int:
    """Open a reign for every solo game's current #1 that has none yet, backdating
    ``started_at`` to when that score was set - the best available proxy for how
    long the current champ has already reigned. One-off; reconcile maintains it
    from then on. Returns how many reigns were opened.
    """
    games = (await db.execute(select(PersonalBest.game_type).distinct())).scalars().all()
    opened = 0
    for game in games:
        if await _open_reign(db, game) is not None:
            continue
        top = await _current_top(db, game)
        if top is None:
            continue
        db.add(
            LeaderboardReign(
                game_type=game,
                holder_did=top.player_id,
                best_score=top.best_score,
                started_at=_aware(top.updated_at),
            )
        )
        opened += 1
    await db.commit()
    return opened


async def longest(db: AsyncSession, limit: int = 20) -> list[dict]:
    """Every reign, longest first, with holder + whole-day count. For the Hall of
    Fame. Ongoing reigns are measured to now, ended ones to their close.
    """
    reigns = (await db.execute(select(LeaderboardReign))).scalars().all()
    now = datetime.now(timezone.utc)

    def _dur_days(r: LeaderboardReign) -> float:
        end = _aware(r.ended_at) if r.ended_at is not None else now
        return (end - _aware(r.started_at)).total_seconds() / 86400.0

    reigns = sorted(reigns, key=_dur_days, reverse=True)[:limit]
    return [
        {
            "game_type": r.game_type,
            "holder_did": r.holder_did,
            "best_score": r.best_score,
            "days": int(_dur_days(r)),
            "current": r.ended_at is None,
            "started_at": _aware(r.started_at),
            "ended_at": _aware(r.ended_at) if r.ended_at is not None else None,
        }
        for r in reigns
    ]
