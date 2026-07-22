from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.games.registry import get_game
from app.models import GameSession, PersonalBest, User
from app.schemas.rest import (
    Badge,
    ProfileGame,
    ProfileRecent,
    ProfileResponse,
    ProfileRival,
    RankingEntry,
    RankingResponse,
    UserStats,
)

router = APIRouter(prefix="/users", tags=["users"])


def _profile_badges(
    user: User,
    bests: list[ProfileGame],
    versus_played: int,
    versus_won: int,
    solo_played: int,
    rivals: list[ProfileRival],
) -> list[Badge]:
    """Milestones derived from existing stats (no badge table - recomputed live,
    so a badge can also disappear if the stat behind it falls back)."""
    badges: list[Badge] = []

    # Volume tier: only the highest one you qualify for is shown.
    for n, label in ((500, "Legend"), (100, "Century"), (50, "Regular"), (10, "Getting started")):
        if user.games_played >= n:
            badges.append(Badge(key=f"games_{n}", label=label, detail=f"{n}+ games played"))
            break

    if user.games_won >= 1:
        badges.append(Badge(key="first_win", label="First win", detail="won your first 1v1"))
    if user.games_won >= 50:
        badges.append(Badge(key="wins_50", label="Sharpshooter", detail="50+ 1v1 wins"))

    # Form, over 1v1 games ONLY - solo runs must not dilute the rate.
    if versus_played >= 20 and (versus_won / versus_played) >= 0.6:
        badges.append(Badge(key="on_a_tear", label="On a tear", detail="60%+ 1v1 win rate"))

    # Commitment to each side of the game.
    if versus_played >= 25:
        badges.append(Badge(key="duelist", label="Duelist", detail=f"{versus_played} 1v1 games"))
    if solo_played >= 25:
        badges.append(Badge(key="soloist", label="Soloist", detail=f"{solo_played} solo runs"))

    # Breadth: how many different games they've actually put a score on.
    if len(bests) >= 5:
        badges.append(Badge(key="explorer", label="Explorer", detail=f"scored in {len(bests)} different games"))

    # A real head-to-head rivalry.
    if rivals:
        top_rival = max(rivals, key=lambda r: r.games)
        if top_rival.games >= 5:
            badges.append(Badge(
                key="nemesis", label="Nemesis",
                detail=f"{top_rival.games} games vs @{top_rival.handle}",
            ))

    if user.total_score >= 10_000:
        badges.append(Badge(key="stacked", label="Stacked", detail=f"{user.total_score:,} total points"))

    # Time served.
    created = user.created_at
    if created is not None:
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        days = (datetime.now(timezone.utc) - created).days
        if days >= 30:
            badges.append(Badge(key="veteran", label="Veteran", detail=f"{days} days in the cave"))

    if bests:
        top = max(bests, key=lambda b: b.plays)
        if top.plays >= 15:
            g = get_game(top.game_type)
            name = g.name if g else top.game_type
            badges.append(Badge(key="devoted", label="Devoted", detail=f"{top.plays} plays of {name}"))
    return badges


@router.get("/{did:path}/stats", response_model=UserStats)
async def user_stats(did: str, db: AsyncSession = Depends(get_db)) -> UserStats:
    """Player stats keyed by AT Protocol DID (the canonical user id)."""
    user = await db.get(User, did)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    win_rate = (user.games_won / user.games_played) if user.games_played else 0.0
    return UserStats(
        did=user.did,
        handle=user.handle,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        games_played=user.games_played,
        games_won=user.games_won,
        total_score=user.total_score,
        win_rate=round(win_rate, 3),
    )


@router.get("/ranking", response_model=RankingResponse)
async def ranking(db: AsyncSession = Depends(get_db), limit: int = 500) -> RankingResponse:
    """Global player ranking: 1v1 wins, then total score (same order as the
    profile rank). Inactive accounts (no games, no score) are omitted; they never
    outrank an active player, so the ranks of everyone shown are unaffected."""
    rank_col = func.rank().over(
        order_by=(User.games_won.desc(), User.total_score.desc())
    ).label("rank")
    rows = (
        await db.execute(
            select(
                rank_col,
                User.did,
                User.handle,
                User.display_name,
                User.avatar_url,
                User.games_won,
                User.total_score,
            )
            .where(or_(User.games_played > 0, User.total_score > 0))
            .order_by(User.games_won.desc(), User.total_score.desc(), User.handle)
            .limit(limit)
        )
    ).all()
    return RankingResponse(
        entries=[
            RankingEntry(
                rank=r[0], did=r[1], handle=r[2], display_name=r[3],
                avatar_url=r[4], games_won=r[5], total_score=r[6],
            )
            for r in rows
        ]
    )


@router.get("/handle/{handle}/profile", response_model=ProfileResponse)
async def profile(handle: str, db: AsyncSession = Depends(get_db)) -> ProfileResponse:
    """Public player profile, resolved by Bluesky handle."""
    user = (await db.execute(select(User).where(User.handle == handle))).scalars().first()
    if user is None:
        raise HTTPException(status_code=404, detail="Player not found")
    did = user.did
    win_rate = (user.games_won / user.games_played) if user.games_played else 0.0
    # Rank by 1v1 wins, then total score as the tiebreak (a player ranks above
    # you if they have more wins, or the same wins but a higher total score).
    rank = (
        await db.scalar(
            select(func.count())
            .select_from(User)
            .where(
                or_(
                    User.games_won > user.games_won,
                    and_(
                        User.games_won == user.games_won,
                        User.total_score > user.total_score,
                    ),
                )
            )
        )
        or 0
    ) + 1

    # 1v1 vs solo split. games_played counts every mode; solo has no winner, so a
    # single "win rate" over all games is diluted by practice runs. Report the
    # honest 1v1 record separately.
    in_versus = (GameSession.mode == "versus") & (
        (GameSession.player1_id == did) | (GameSession.player2_id == did)
    )
    versus_played = await db.scalar(select(func.count()).select_from(GameSession).where(in_versus)) or 0
    versus_won = await db.scalar(
        select(func.count()).select_from(GameSession).where(in_versus, GameSession.winner_id == did)
    ) or 0
    versus_lost = await db.scalar(
        select(func.count()).select_from(GameSession).where(
            in_versus, GameSession.winner_id.isnot(None), GameSession.winner_id != did
        )
    ) or 0
    solo_played = await db.scalar(
        select(func.count()).select_from(GameSession).where(
            GameSession.mode == "solo", GameSession.player1_id == did
        )
    ) or 0
    versus_win_rate = (versus_won / versus_played) if versus_played else 0.0

    best_rows = (
        await db.execute(
            select(PersonalBest).where(PersonalBest.player_id == did).order_by(desc(PersonalBest.plays))
        )
    ).scalars().all()
    bests = [ProfileGame(game_type=b.game_type, best_score=b.best_score, plays=b.plays) for b in best_rows]

    recent_rows = (
        await db.execute(
            select(GameSession)
            .where(or_(GameSession.player1_id == did, GameSession.player2_id == did))
            .order_by(desc(GameSession.created_at))
            .limit(10)
        )
    ).scalars().all()
    recent: list[ProfileRecent] = []
    for s in recent_rows:
        is_p1 = s.player1_id == did
        your_score = (s.player1_score if is_p1 else s.player2_score) or 0
        opp_handle = s.player2_handle if is_p1 else s.player1_handle
        if s.mode == "solo":
            result, opponent = "solo", "Caver"
        elif s.winner_id is None:
            result, opponent = "draw", opp_handle
        elif s.winner_id == did:
            result, opponent = "win", opp_handle
        else:
            result, opponent = "loss", opp_handle
        recent.append(
            ProfileRecent(
                game_type=s.game_type, mode=s.mode, result=result,
                opponent=opponent, your_score=your_score, created_at=s.created_at,
            )
        )

    # Head-to-head rivalries (versus, named Bluesky opponents only).
    rival_rows = (
        await db.execute(
            select(GameSession)
            .where(GameSession.mode == "versus", or_(GameSession.player1_id == did, GameSession.player2_id == did))
            .order_by(desc(GameSession.created_at))
            .limit(500)
        )
    ).scalars().all()
    rmap: dict[str, dict] = {}
    for s in rival_rows:
        is_p1 = s.player1_id == did
        opp_id = s.player2_id if is_p1 else s.player1_id
        opp_handle = s.player2_handle if is_p1 else s.player1_handle
        if not opp_id or opp_id == "ai" or opp_id.startswith("guest:"):
            continue
        r = rmap.setdefault(opp_id, {"handle": opp_handle, "wins": 0, "losses": 0, "games": 0})
        r["games"] += 1
        if s.winner_id == did:
            r["wins"] += 1
        elif s.winner_id == opp_id:
            r["losses"] += 1
    rivals = sorted(
        (ProfileRival(handle=v["handle"], wins=v["wins"], losses=v["losses"], games=v["games"]) for v in rmap.values()),
        key=lambda r: -r.games,
    )[:5]

    return ProfileResponse(
        handle=user.handle,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        joined=user.created_at,
        games_played=user.games_played,
        games_won=user.games_won,
        win_rate=round(win_rate, 3),
        versus_played=versus_played,
        versus_won=versus_won,
        versus_lost=versus_lost,
        versus_win_rate=round(versus_win_rate, 3),
        solo_played=solo_played,
        total_score=user.total_score,
        rank=rank,
        bests=bests,
        recent=recent,
        rivals=rivals,
        badges=_profile_badges(user, bests, versus_played, versus_won, solo_played, rivals),
    )
