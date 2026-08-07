"""Friends: the people you follow on Bluesky who are already on Skycave.

The intersection of your public follow graph and Skycave's user table, so every
name here is a real, ready opponent (no onboarding needed to challenge them).
Nothing new is stored: follows come from the public AppView by DID, and the
overlap is computed against the users we already have, cached per-person like
the leaderboard so a page load is a cache hit.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import BlueskyIdentity
from app.core.redis_client import get_redis
from app.models import User
from app.services import bluesky_auth as bsky

router = APIRouter(prefix="/friends", tags=["friends"])

CACHE_TTL = 300  # 5 min; the overlap barely moves between plays
CACHE_VER = "v1"

# The house account is not a "friend" you'd challenge, so it never shows up here
# even if you follow it.
HOUSE_DIDS = {"did:plc:4rae755aoggod5w22tsmty7h"}  # skycave.space


class Friend(BaseModel):
    did: str
    handle: str
    display_name: str | None = None
    avatar_url: str | None = None
    games_played: int = 0
    is_mutual: bool = False


class FriendsResponse(BaseModel):
    generated_at: datetime
    friends: list[Friend]


async def _build(db: AsyncSession, did: str) -> FriendsResponse:
    follow_dids = await bsky.fetch_follows(did)
    friends: list[Friend] = []
    if follow_dids:
        wanted = set(follow_dids) - HOUSE_DIDS - {did}
        rows = (
            await db.execute(select(User).where(User.did.in_(wanted)))
        ).scalars().all()
        mutual = await bsky.mutuals_among(did, [u.did for u in rows])
        friends = [
            Friend(
                did=u.did,
                handle=u.handle,
                display_name=u.display_name,
                avatar_url=u.avatar_url,
                games_played=u.games_played or 0,
                is_mutual=u.did in mutual,
            )
            for u in rows
        ]
        # Mutuals first (your closest people), then the most active, then a
        # stable handle sort so the order never flickers between reads.
        friends.sort(key=lambda f: (not f.is_mutual, -f.games_played, f.handle))
    return FriendsResponse(generated_at=datetime.now(timezone.utc), friends=friends)


@router.get("", response_model=FriendsResponse)
async def list_friends(
    identity: BlueskyIdentity,
    db: AsyncSession = Depends(get_db),
) -> FriendsResponse:
    r = get_redis()
    key = f"friends:{CACHE_VER}:{identity.id}"
    cached = await r.get(key)
    if cached:
        return FriendsResponse.model_validate_json(cached)
    resp = await _build(db, identity.id)
    await r.set(key, resp.model_dump_json(), ex=CACHE_TTL)
    return resp
