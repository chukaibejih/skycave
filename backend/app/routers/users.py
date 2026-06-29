from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import User
from app.schemas.rest import UserStats

router = APIRouter(prefix="/users", tags=["users"])


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
