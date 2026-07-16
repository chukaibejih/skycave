"""Backoffice API — admin-password login + read-only metrics.

Auth: POST /admin/login with the ADMIN_PASSWORD issues a short-lived admin JWT;
all other endpoints require it (see core.deps.require_admin). If ADMIN_PASSWORD
is unset, admin access is disabled entirely.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import bindparam, desc, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import AdminAuth
from app.core.redis_client import get_redis
from app.core.security import create_admin_token
from app.models import Feedback, GameSession, Room, User
from app.schemas.rest import (
    AdminFeedbackResponse,
    AdminFeedbackRow,
    AdminGameRow,
    AdminGamesResponse,
    AdminInsights,
    AdminLoginRequest,
    AdminOverview,
    AdminTimeseries,
    AdminTokenResponse,
    AdminUsersResponse,
    ActiveUsers,
    DayBucket,
    DeviceSplit,
    FunnelStat,
    GameBalance,
    GameTypeCount,
    LabelCount,
    RetentionSplit,
    SplitCount,
    TopPlayer,
    UserStats,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/login", response_model=AdminTokenResponse)
async def admin_login(body: AdminLoginRequest) -> AdminTokenResponse:
    if not settings.admin_password:
        raise HTTPException(status_code=403, detail="Admin access is disabled")
    # Constant-ish comparison is fine here; password is a single shared secret.
    if body.password != settings.admin_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid password"
        )
    return AdminTokenResponse(token=create_admin_token())


async def _count_rooms() -> tuple[int, int]:
    """Scan Redis for live rooms; return (total, in_progress).

    Collects keys via SCAN, then fetches values in batched MGETs instead of one
    GET per key (turns N round-trips into ~N/500).
    """
    r = get_redis()
    keys: list[str] = []
    async for key in r.scan_iter(match="room:*", count=500):
        keys.append(key)
        if len(keys) >= 2000:  # safety cap
            break

    in_progress = 0
    for i in range(0, len(keys), 500):
        for raw in await r.mget(keys[i : i + 500]):
            if raw:
                try:
                    if json.loads(raw).get("status") == "in_progress":
                        in_progress += 1
                except (ValueError, TypeError):
                    pass
    return len(keys), in_progress


@router.get("/overview", response_model=AdminOverview)
async def overview(_: AdminAuth, db: AsyncSession = Depends(get_db)) -> AdminOverview:
    users = await db.scalar(select(func.count()).select_from(User)) or 0
    games_played = await db.scalar(select(func.count()).select_from(GameSession)) or 0

    since = datetime.now(timezone.utc) - timedelta(hours=24)
    games_24h = (
        await db.scalar(
            select(func.count()).select_from(GameSession).where(
                GameSession.created_at >= since
            )
        )
        or 0
    )

    by_game_rows = (
        await db.execute(
            select(GameSession.game_type, func.count())
            .group_by(GameSession.game_type)
            .order_by(desc(func.count()))
        )
    ).all()
    by_game = [GameTypeCount(game_type=gt, count=c) for gt, c in by_game_rows]

    total_rooms, in_progress = await _count_rooms()

    return AdminOverview(
        users=users,
        games_played=games_played,
        games_24h=games_24h,
        active_rooms=total_rooms,
        rooms_in_progress=in_progress,
        by_game=by_game,
    )


@router.get("/timeseries", response_model=AdminTimeseries)
async def timeseries(
    _: AdminAuth,
    db: AsyncSession = Depends(get_db),
    days: int = Query(30, ge=7, le=90),
) -> AdminTimeseries:
    """Daily activity for the last `days`: games (by mode), new users, feedback.

    Buckets are continuous (missing days filled with 0) and dated in UTC so the
    front end can render a gap-free time series.
    """
    start = (datetime.now(timezone.utc) - timedelta(days=days - 1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    game_rows = (
        await db.execute(
            select(
                func.date(GameSession.created_at).label("d"),
                GameSession.mode,
                func.count(),
            )
            .where(GameSession.created_at >= start)
            .group_by("d", GameSession.mode)
        )
    ).all()
    user_rows = (
        await db.execute(
            select(func.date(User.created_at).label("d"), func.count())
            .where(User.created_at >= start)
            .group_by("d")
        )
    ).all()
    fb_rows = (
        await db.execute(
            select(func.date(Feedback.created_at).label("d"), func.count())
            .where(Feedback.created_at >= start)
            .group_by("d")
        )
    ).all()

    games: dict[str, dict[str, int]] = {}
    for d, mode, c in game_rows:
        bucket = games.setdefault(d.isoformat(), {"versus": 0, "solo": 0})
        bucket["solo" if mode == "solo" else "versus"] += int(c)
    users = {d.isoformat(): int(c) for d, c in user_rows}
    feedback = {d.isoformat(): int(c) for d, c in fb_rows}

    buckets = []
    for i in range(days):
        day = (start + timedelta(days=i)).date().isoformat()
        g = games.get(day, {})
        buckets.append(
            DayBucket(
                date=day,
                versus=g.get("versus", 0),
                solo=g.get("solo", 0),
                users=users.get(day, 0),
                feedback=feedback.get(day, 0),
            )
        )
    return AdminTimeseries(days=days, buckets=buckets)


@router.get("/insights", response_model=AdminInsights)
async def insights(_: AdminAuth, db: AsyncSession = Depends(get_db)) -> AdminInsights:
    """Deeper cuts over data we already store: guest-vs-Bluesky play share, the
    1v1 invite funnel, and where/how feedback comes in."""
    G = "guest:%"  # every guest id is prefixed "guest:"; a DID is a Bluesky account

    # --- Guest vs Bluesky: share of all plays (count each occupied player slot) ---
    p1_guest = await db.scalar(select(func.count()).where(GameSession.player1_id.like(G))) or 0
    p1_all = await db.scalar(select(func.count()).select_from(GameSession)) or 0
    p2_guest = await db.scalar(select(func.count()).where(GameSession.player2_id.like(G))) or 0
    p2_all = await db.scalar(select(func.count()).where(GameSession.player2_id.isnot(None))) or 0
    guest_plays = p1_guest + p2_guest
    bluesky_plays = (p1_all - p1_guest) + (p2_all - p2_guest)

    # --- 1v1 invite funnel: filled (played) vs expired (nobody joined in time) ---
    # Only versus rooms arm an expiry timer, so status == "expired" always means a
    # 1v1 room whose invite found no opponent. A finished 1v1 game is a versus
    # GameSession.
    filled = await db.scalar(select(func.count()).where(GameSession.mode == "versus")) or 0
    expired = await db.scalar(select(func.count()).select_from(Room).where(Room.status == "expired")) or 0

    # --- Feedback by page ---
    page_rows = (
        await db.execute(
            select(Feedback.page, func.count())
            .group_by(Feedback.page)
            .order_by(desc(func.count()))
            .limit(12)
        )
    ).all()
    by_page = [LabelCount(label=(p or "(unknown)"), count=c) for p, c in page_rows]

    # --- Feedback by device (parse the user agent) ---
    total_fb = await db.scalar(select(func.count()).select_from(Feedback)) or 0
    unknown = await db.scalar(select(func.count()).where(Feedback.user_agent.is_(None))) or 0
    mobile = (
        await db.scalar(
            select(func.count()).where(
                Feedback.user_agent.isnot(None),
                or_(
                    Feedback.user_agent.ilike("%Mobile%"),
                    Feedback.user_agent.ilike("%Android%"),
                    Feedback.user_agent.ilike("%iPhone%"),
                    Feedback.user_agent.ilike("%iPad%"),
                ),
            )
        )
        or 0
    )
    desktop = max(0, total_fb - unknown - mobile)

    # --- Active Bluesky members (DAU/WAU/MAU) + new-vs-returning retention ---
    # Every play slot, guests excluded (their id is fresh each session, so they
    # can never be "returning").
    now = datetime.now(timezone.utc)
    plays_union = """
        SELECT player1_id AS pid, created_at FROM game_sessions WHERE player1_id NOT LIKE 'guest:%'
        UNION ALL
        SELECT player2_id AS pid, created_at FROM game_sessions
          WHERE player2_id IS NOT NULL AND player2_id NOT LIKE 'guest:%'
    """

    async def active_since(days: int) -> int:
        q = text(f"SELECT count(DISTINCT pid) FROM ({plays_union}) s WHERE created_at >= :since")
        return (await db.scalar(q, {"since": now - timedelta(days=days)})) or 0

    dau, wau, mau = await active_since(1), await active_since(7), await active_since(30)

    week_ago = now - timedelta(days=7)
    ret = (
        await db.execute(
            text(
                f"""
        WITH p AS (
            SELECT pid, MIN(created_at) AS first_seen, MAX(created_at) AS last_seen
            FROM ({plays_union}) s GROUP BY pid
        )
        SELECT
            COUNT(*) FILTER (WHERE last_seen >= :w AND first_seen >= :w) AS new_count,
            COUNT(*) FILTER (WHERE last_seen >= :w AND first_seen < :w) AS returning_count
        FROM p
        """
            ),
            {"w": week_ago},
        )
    ).one()
    new_p, returning_p = int(ret[0] or 0), int(ret[1] or 0)

    # --- Top players (registered accounts, by games played) ---
    # games_played spans all modes; solo has no winner, so win rate is reported
    # over 1v1 games only (else practice runs drag it down). Split 1v1/solo per
    # player with one grouped pass over both participant slots.
    top_rows = (
        await db.execute(
            select(User.did, User.handle, User.games_played, User.games_won)
            .where(User.games_played > 0)
            .order_by(desc(User.games_played))
            .limit(8)
        )
    ).all()
    top_dids = [r[0] for r in top_rows]
    vmap: dict[str, int] = {}
    if top_dids:
        vrows = (
            await db.execute(
                text(
                    """
        SELECT pid, count(*) AS versus_games
        FROM (
            SELECT player1_id AS pid FROM game_sessions WHERE mode='versus'
            UNION ALL
            SELECT player2_id AS pid FROM game_sessions WHERE mode='versus' AND player2_id IS NOT NULL
        ) t
        WHERE pid IN :dids
        GROUP BY pid
        """
                ).bindparams(bindparam("dids", expanding=True)),
                {"dids": top_dids},
            )
        ).all()
        vmap = {pid: int(vg) for pid, vg in vrows}
    top_players = [
        TopPlayer(
            handle=h,
            games=gp,
            versus_games=vmap.get(did_, 0),
            solo=max(0, gp - vmap.get(did_, 0)),
            wins=gw,
            win_rate=(gw / vmap[did_] if vmap.get(did_) else 0.0),
        )
        for did_, h, gp, gw in top_rows
    ]

    # --- Per-game balance & depth ---
    # First-player win rate over decisive 1v1 games is the fairness signal: a value
    # far from 50% means a first-mover advantage (or a bug). Solo (vs the AI) is
    # excluded from the rate.
    balance_rows = (
        await db.execute(
            text(
                """
        SELECT game_type,
            count(*) AS games,
            count(*) FILTER (WHERE mode='versus') AS versus,
            count(*) FILTER (WHERE mode='solo') AS solo,
            count(*) FILTER (WHERE mode='versus' AND winner_id IS NOT NULL) AS decisive,
            count(*) FILTER (WHERE mode='versus' AND winner_id IS NOT NULL AND winner_id = player1_id) AS p1_wins,
            count(*) FILTER (WHERE mode='versus' AND winner_id IS NULL) AS draws,
            coalesce(avg(player1_score), 0)::float AS avg_score
        FROM game_sessions
        GROUP BY game_type
        ORDER BY count(*) DESC
        """
            )
        )
    ).all()
    game_balance = [
        GameBalance(
            game_type=gt,
            games=games,
            versus=versus,
            solo=solo,
            decisive=decisive,
            first_player_win_rate=(p1w / decisive if decisive else 0.0),
            draw_rate=(draws / versus if versus else 0.0),
            avg_score=float(avg_score or 0),
        )
        for gt, games, versus, solo, decisive, p1w, draws, avg_score in balance_rows
    ]

    return AdminInsights(
        plays=SplitCount(guest=guest_plays, bluesky=bluesky_plays),
        funnel=FunnelStat(filled=filled, expired=expired),
        feedback_by_page=by_page,
        feedback_by_device=DeviceSplit(mobile=mobile, desktop=desktop, unknown=unknown),
        active=ActiveUsers(dau=dau, wau=wau, mau=mau),
        retention=RetentionSplit(new=new_p, returning=returning_p),
        top_players=top_players,
        game_balance=game_balance,
    )


@router.get("/users", response_model=AdminUsersResponse)
async def users(
    _: AdminAuth,
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> AdminUsersResponse:
    total = await db.scalar(select(func.count()).select_from(User)) or 0
    rows = (
        await db.execute(
            select(User)
            .order_by(desc(User.created_at))
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()
    return AdminUsersResponse(
        total=total,
        users=[
            UserStats(
                did=u.did,
                handle=u.handle,
                display_name=u.display_name,
                avatar_url=u.avatar_url,
                games_played=u.games_played,
                games_won=u.games_won,
                total_score=u.total_score,
                win_rate=round(u.games_won / u.games_played, 3) if u.games_played else 0.0,
                created_at=u.created_at,
            )
            for u in rows
        ],
    )


@router.get("/games", response_model=AdminGamesResponse)
async def games(
    _: AdminAuth,
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> AdminGamesResponse:
    total = await db.scalar(select(func.count()).select_from(GameSession)) or 0
    rows = (
        await db.execute(
            select(GameSession)
            .order_by(desc(GameSession.created_at))
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()
    return AdminGamesResponse(
        total=total,
        games=[
            AdminGameRow(
                id=g.id,
                game_type=g.game_type,
                mode=g.mode,
                player1_handle=g.player1_handle,
                player1_score=g.player1_score,
                player2_handle=g.player2_handle,
                player2_score=g.player2_score,
                winner_id=g.winner_id,
                created_at=g.created_at,
            )
            for g in rows
        ],
    )


@router.get("/feedback", response_model=AdminFeedbackResponse)
async def feedback(
    _: AdminAuth,
    db: AsyncSession = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> AdminFeedbackResponse:
    total = await db.scalar(select(func.count()).select_from(Feedback)) or 0
    rows = (
        await db.execute(
            select(Feedback)
            .order_by(desc(Feedback.created_at))
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()
    return AdminFeedbackResponse(
        total=total,
        feedback=[
            AdminFeedbackRow(
                id=f.id,
                message=f.message,
                submitter_handle=f.submitter_handle,
                is_guest=f.is_guest,
                page=f.page,
                created_at=f.created_at,
            )
            for f in rows
        ],
    )
