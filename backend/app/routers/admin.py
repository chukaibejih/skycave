"""Backoffice API - admin-password login + read-only metrics.

Auth: POST /admin/login with the ADMIN_PASSWORD issues a short-lived admin JWT;
all other endpoints require it (see core.deps.require_admin). If ADMIN_PASSWORD
is unset, admin access is disabled entirely.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import bindparam, case, desc, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import AdminAuth
from app.core.redis_client import get_redis
from app.core.security import create_admin_token
from app.models import Feedback, GameSession, Room, User
from app.models.game_session import HEAD_TO_HEAD_MODES, SINGLE_PLAYER_MODES
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
    FeedbackResolveRequest,
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
logger = logging.getLogger(__name__)


def _score_for(did: str):
    """SQL expression: this user's own score in a game_sessions row."""
    return case(
        (GameSession.player1_id == did, GameSession.player1_score),
        (GameSession.player2_id == did, GameSession.player2_score),
        else_=0,
    )


async def _recompute_user_stats(
    db: AsyncSession, did: str, pb_game_types: set[str] | None = None
) -> User | None:
    """Re-derive a user's aggregates from game_sessions (the single source of
    truth) - aggregates come from ALL sessions (both sides). Personal bests are
    only re-derived for the game types in `pb_game_types` (e.g. the type of a
    deleted session): a PB with no backing solo session - an older record - is
    left untouched, so a stat repair never destroys a personal best."""
    user = await db.get(User, did)
    if user is None:
        return None
    played_where = or_(GameSession.player1_id == did, GameSession.player2_id == did)
    user.games_played = await db.scalar(
        select(func.count()).select_from(GameSession).where(played_where)
    ) or 0
    user.games_won = await db.scalar(
        select(func.count()).select_from(GameSession).where(GameSession.winner_id == did)
    ) or 0
    user.total_score = int(
        await db.scalar(
            select(func.coalesce(func.sum(_score_for(did)), 0)).where(played_where)
        ) or 0
    )
    if pb_game_types:
        from app.models import PersonalBest

        for gt in pb_game_types:
            best, plays = (
                await db.execute(
                    select(func.max(_score_for(did)), func.count()).where(
                        GameSession.game_type == gt,
                        GameSession.mode.in_(SINGLE_PLAYER_MODES),
                        played_where,
                    )
                )
            ).one()
            pb = await db.get(PersonalBest, (did, gt))
            if plays:
                if pb is None:
                    db.add(
                        PersonalBest(
                            player_id=did, game_type=gt,
                            best_score=int(best or 0), plays=int(plays),
                        )
                    )
                else:
                    pb.best_score = int(best or 0)
                    pb.plays = int(plays)
            elif pb is not None:
                await db.delete(pb)
    return user


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
        bucket["solo" if mode in SINGLE_PLAYER_MODES else "versus"] += int(c)
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
    filled = await db.scalar(
        select(func.count()).where(GameSession.mode.in_(HEAD_TO_HEAD_MODES))
    ) or 0
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
    q: str | None = Query(None, description="search handle / display name"),
    sort: str = Query("created", pattern="^(created|played|won|win_rate|score)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
) -> AdminUsersResponse:
    conds = []
    if q and q.strip():
        like = f"%{q.strip()}%"
        conds.append(or_(User.handle.ilike(like), User.display_name.ilike(like)))
    total = await db.scalar(select(func.count()).select_from(User).where(*conds)) or 0
    win_rate = func.coalesce(User.games_won * 1.0 / func.nullif(User.games_played, 0), 0)
    sort_col = {
        "created": User.created_at,
        "played": User.games_played,
        "won": User.games_won,
        "win_rate": win_rate,
        "score": User.total_score,
    }[sort]
    ordered = sort_col.desc() if order == "desc" else sort_col.asc()
    rows = (
        await db.execute(
            select(User).where(*conds).order_by(ordered).limit(limit).offset(offset)
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
    game_type: str | None = Query(None),
    mode: str | None = Query(None),
    q: str | None = Query(None, description="search either player's handle"),
) -> AdminGamesResponse:
    conds = []
    if game_type:
        conds.append(GameSession.game_type == game_type)
    if mode:
        conds.append(GameSession.mode == mode)
    if q and q.strip():
        like = f"%{q.strip()}%"
        conds.append(
            or_(GameSession.player1_handle.ilike(like), GameSession.player2_handle.ilike(like))
        )
    total = await db.scalar(select(func.count()).select_from(GameSession).where(*conds)) or 0
    rows = (
        await db.execute(
            select(GameSession)
            .where(*conds)
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
    resolved: bool | None = Query(None, description="filter by resolved state"),
) -> AdminFeedbackResponse:
    conds = [] if resolved is None else [Feedback.resolved == resolved]
    total = await db.scalar(select(func.count()).select_from(Feedback).where(*conds)) or 0
    rows = (
        await db.execute(
            select(Feedback)
            .where(*conds)
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
                resolved=f.resolved,
            )
            for f in rows
        ],
    )


@router.patch("/feedback/{fid}")
async def resolve_feedback(
    fid: int,
    body: FeedbackResolveRequest,
    _: AdminAuth,
    db: AsyncSession = Depends(get_db),
) -> dict[str, int | bool]:
    """Mark a feedback item resolved (or reopen it)."""
    fb = await db.get(Feedback, fid)
    if fb is None:
        raise HTTPException(status_code=404, detail="Feedback not found")
    fb.resolved = body.resolved
    await db.commit()
    return {"id": fid, "resolved": body.resolved}


# --------------------------------------------------------------------------- #
# Session management (delete / repair)
# --------------------------------------------------------------------------- #

@router.post("/users/{did}/recompute")
async def recompute_user(
    did: str, _: AdminAuth, db: AsyncSession = Depends(get_db)
) -> dict[str, int | str]:
    """Re-derive a user's stats + personal bests from game_sessions - repairs
    drift (e.g. a bug that inflated a counter) with no data loss."""
    user = await _recompute_user_stats(db, did)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    await db.commit()
    return {
        "did": did,
        "games_played": user.games_played,
        "games_won": user.games_won,
        "total_score": user.total_score,
    }


@router.delete("/games/{gid}")
async def delete_game(
    gid: int, _: AdminAuth, db: AsyncSession = Depends(get_db)
) -> dict:
    """Delete a game session and re-derive every affected real user's stats from
    the remaining sessions. Guests/AI have no User row and are skipped. The row
    is logged first as an audit snapshot."""
    g = await db.get(GameSession, gid)
    if g is None:
        raise HTTPException(status_code=404, detail="Game session not found")
    logger.info(
        "admin delete game_session id=%s type=%s mode=%s p1=%s p2=%s winner=%s scores=%s/%s",
        g.id, g.game_type, g.mode, g.player1_id, g.player2_id,
        g.winner_id, g.player1_score, g.player2_score,
    )
    game_type = g.game_type
    affected = [p for p in (g.player1_id, g.player2_id) if p]
    await db.delete(g)
    await db.flush()
    recomputed: dict[str, dict[str, int]] = {}
    for did in affected:
        u = await _recompute_user_stats(db, did, pb_game_types={game_type})
        if u is not None:
            recomputed[did] = {
                "games_played": u.games_played,
                "games_won": u.games_won,
                "total_score": u.total_score,
            }
    await db.commit()
    return {"deleted": gid, "recomputed": recomputed}


# --------------------------------------------------------------------------- #
# Tournaments (insight)
# --------------------------------------------------------------------------- #

class AdminTournamentRow(BaseModel):
    id: str
    name: str
    status: str
    entrants: int
    max_players: int
    rounds: int
    champion: str | None = None
    created_at: datetime
    registration_closes_at: datetime
    matches_done: int
    matches_total: int


class AdminTournamentsSummary(BaseModel):
    total: int
    registering: int
    live: int          # locked or in_progress
    finished: int
    unique_entrants: int   # distinct Bluesky accounts that have ever entered
    series_played: int     # decided, non-bye fixtures across all events


class AdminTournamentsResponse(BaseModel):
    summary: AdminTournamentsSummary
    tournaments: list[AdminTournamentRow]


@router.get("/tournaments", response_model=AdminTournamentsResponse)
async def admin_tournaments(
    _: AdminAuth, db: AsyncSession = Depends(get_db)
) -> AdminTournamentsResponse:
    """Every tournament, newest first, plus a roll-up. Entrants and matches are
    each fetched once and grouped in memory rather than per-tournament."""
    from app.models.tournament import (
        Tournament,
        TournamentEntrant,
        TournamentMatch,
    )

    ts = (
        await db.execute(select(Tournament).order_by(desc(Tournament.created_at)))
    ).scalars().all()
    ents = (await db.execute(select(TournamentEntrant))).scalars().all()
    matches = (await db.execute(select(TournamentMatch))).scalars().all()

    ent_by_t: dict[str, list] = {}
    handle_of: dict[tuple[str, str], str] = {}  # (tid, did) -> handle
    for e in ents:
        ent_by_t.setdefault(e.tournament_id, []).append(e)
        handle_of[(e.tournament_id, e.did)] = e.handle

    match_by_t: dict[str, list] = {}
    for m in matches:
        match_by_t.setdefault(m.tournament_id, []).append(m)

    rows: list[AdminTournamentRow] = []
    live = finished = registering = 0
    series_played = 0
    for t in ts:
        if t.status == "registering":
            registering += 1
        elif t.status == "finished":
            finished += 1
        else:
            live += 1
        tm = match_by_t.get(t.id, [])
        # A "played" series is a decided fixture that was actually contested (has
        # two players), i.e. not a walkover bye.
        contested = [m for m in tm if m.status != "bye" and m.player1_did and m.player2_did]
        done = [m for m in contested if m.winner_did]
        series_played += len(done)
        rows.append(
            AdminTournamentRow(
                id=t.id,
                name=t.name,
                status=t.status,
                entrants=len(ent_by_t.get(t.id, [])),
                max_players=t.max_players,
                rounds=t.rounds,
                champion=handle_of.get((t.id, t.champion_did or "")),
                created_at=t.created_at,
                registration_closes_at=t.registration_closes_at,
                matches_done=len([m for m in tm if m.status in ("done", "bye")]),
                matches_total=len(tm),
            )
        )

    return AdminTournamentsResponse(
        summary=AdminTournamentsSummary(
            total=len(ts),
            registering=registering,
            live=live,
            finished=finished,
            unique_entrants=len({e.did for e in ents}),
            series_played=series_played,
        ),
        tournaments=rows,
    )
