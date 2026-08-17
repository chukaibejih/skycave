"""Solo leaderboard #1 reigns - who has held the top spot, and for how long.

A reign is one continuous spell at #1 on a solo board. ``reconcile`` runs after
every solo personal-best write: it opens a reign for a new #1, closes the
previous one when someone is overtaken, and no-ops while the same player still
leads. ``longest`` ranks reigns by duration for the Hall of Fame. ``rebuild`` is the
one-off backfill: it reconstructs the whole reign history (current and ended)
from ``game_sessions``, accurately dating each reign to when its score was first
reached. (``seed`` is the older current-champ-only backfill; it trusts
``personal_bests.updated_at``, which bumps on every replay, so ``rebuild`` is
preferred and supersedes it.)

Reigns are tracked for SOLO boards only: those rank an all-time best, so #1 is a
stable thing to reign over. The versus boards are a rolling 7-day window, where
"#1" churns by the day and a reign would be meaningless.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GameSession, LeaderboardReign, PersonalBest
from app.models.game_session import SINGLE_PLAYER_MODES

logger = logging.getLogger("skycave.reigns")

# A takeover only earns a standalone @skycave.space post when it dethrones a
# reign at least this long, or ends the longest reign on record. Everyday #1
# churn (~1/day across all boards) would drown the account, so it stays in the
# daily roundup instead.
TAKEOVER_MIN_DAYS = 7

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
        try:
            await _announce_takeover(
                db, game, old_reign=open_r, new_did=top.player_id,
                new_score=top.best_score, at=now,
            )
        except Exception:  # noqa: BLE001 - a missed post must never fail a game
            logger.exception("takeover announce failed for %s", game)
    elif open_r.best_score != top.best_score:
        open_r.best_score = top.best_score  # same champ, improved their own record
    if commit:
        await db.commit()


async def _was_record_reign(db: AsyncSession, old_reign: LeaderboardReign, at: datetime) -> bool:
    """Whether the reign just ending was the longest any player has ever held on
    any board. Measured to ``at`` (its close), against every other reign to its
    own close (or now, for still-open ones)."""
    rows = (
        await db.execute(
            select(LeaderboardReign.id, LeaderboardReign.started_at, LeaderboardReign.ended_at)
        )
    ).all()

    def _secs(started: datetime, ended: datetime | None) -> float:
        end = _aware(ended) if ended is not None else at
        return (end - _aware(started)).total_seconds()

    old = (at - _aware(old_reign.started_at)).total_seconds()
    others = [_secs(s, e) for (i, s, e) in rows if i != old_reign.id]
    return old > 0 and old >= max(others, default=0.0)


async def _announce_takeover(
    db: AsyncSession,
    game: str,
    *,
    old_reign: LeaderboardReign,
    new_did: str,
    new_score: int,
    at: datetime,
) -> None:
    """Queue a standalone "new #1" post when a takeover is genuinely news: it
    dethroned a reign of at least ``TAKEOVER_MIN_DAYS`` days, or ended the longest
    reign on record. Otherwise stay quiet (the roundup carries the small stuff).

    Enqueue only - the drain does the posting - so this never makes a network
    call on the game-finish path. Best effort: the caller swallows failures.
    """
    old_days = (at - _aware(old_reign.started_at)).days
    is_record = await _was_record_reign(db, old_reign, at)
    if old_days < TAKEOVER_MIN_DAYS and not is_record:
        return

    from app.models import User
    from app.services import announce, tournament_posts

    recs = {
        did: (handle, display)
        for did, handle, display in (
            await db.execute(
                select(User.did, User.handle, User.display_name).where(
                    User.did.in_([new_did, old_reign.holder_did])
                )
            )
        ).all()
    }
    new_handle = recs.get(new_did, (None, None))[0]
    if not new_handle:
        return  # can't tag the new champ -> better to stay silent than post a DID
    old_handle, old_display = recs.get(old_reign.holder_did, (None, None))

    text = announce.compose_takeover(
        game_type=game,
        new_handle=new_handle,
        old_handle=old_handle,
        old_display=old_display,
        days=max(old_days, 0),
        new_score=new_score,
        is_record=is_record,
        seed=int(at.timestamp()),
    )
    await tournament_posts.enqueue(
        db,
        kind="leaderboard_takeover",
        dedupe_key=f"takeover:{game}:{int(at.timestamp())}",
        text=text,
    )


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


async def rebuild(db: AsyncSession, *, commit: bool = True) -> int:
    """Reconstruct the full reign history for every solo board from
    ``game_sessions``, replacing all existing reigns. This is the accurate
    backfill: it replays each solo game chronologically and derives each reign
    from when a player *first reached* the score that took (or held) #1 - immune
    to the ``updated_at``-bumps-on-every-replay drift that ``seed`` suffers, and
    it credits reigns that have since ended, not just current champs.

    A player takes #1 only by scoring strictly higher than the standing leader's
    best; matching it does not dethrone. A champ improving their own record keeps
    one continuous reign. Returns how many reigns were written.
    """
    await db.execute(delete(LeaderboardReign))
    # Guests play into game_sessions but never land on the leaderboard
    # (personal_bests skips them), so they can never hold #1 - exclude them, or
    # the reconstruction credits reigns nobody could see on the board.
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

        best: dict[str, int] = {}
        leader: str | None = None
        leader_best = 0
        reigns: list[LeaderboardReign] = []
        for pid, raw_score, ts in rows:
            score = raw_score or 0
            prev = best.get(pid)
            if prev is not None and score <= prev:
                continue  # not a personal best - can't move the standings
            best[pid] = score
            if leader is None:
                leader, leader_best = pid, score
                reigns.append(
                    LeaderboardReign(
                        game_type=game, holder_did=pid, best_score=score, started_at=_aware(ts)
                    )
                )
            elif pid == leader:
                leader_best = score  # champ improved own record; one reign
                reigns[-1].best_score = score
            elif score > leader_best:
                reigns[-1].ended_at = _aware(ts)
                leader, leader_best = pid, score
                reigns.append(
                    LeaderboardReign(
                        game_type=game, holder_did=pid, best_score=score, started_at=_aware(ts)
                    )
                )
            # else: a PB that does not reach #1 - no change of standings
        for r in reigns:
            db.add(r)
        total += len(reigns)
    if commit:
        await db.commit()
    return total


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
