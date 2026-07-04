"""Backoffice API — admin-password login + read-only metrics.

Auth: POST /admin/login with the ADMIN_PASSWORD issues a short-lived admin JWT;
all other endpoints require it (see core.deps.require_admin). If ADMIN_PASSWORD
is unset, admin access is disabled entirely.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import AdminAuth
from app.core.redis_client import get_redis
from app.core.security import create_admin_token
from app.models import Feedback, GameSession, User
from app.schemas.rest import (
    AdminFeedbackResponse,
    AdminFeedbackRow,
    AdminGameRow,
    AdminGamesResponse,
    AdminLoginRequest,
    AdminOverview,
    AdminTokenResponse,
    AdminUsersResponse,
    GameTypeCount,
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
            .order_by(desc(User.total_score), desc(User.games_won))
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
