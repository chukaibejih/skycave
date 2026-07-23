"""Internal-only endpoints, guarded by the shared sidecar secret.

These are never exposed publicly (nginx does not route /internal/* from the
edge, and the secret is required regardless). They drive the @skycave.space
announcement account: a daily results roundup (fired by a host cron) and a
manual new-game launch post.

Composition lives in app.services.announce; the actual Bluesky post is done by
the Node sidecar (POST {sidecar}/internal/announce), which holds the app
password and turns @handles + links into real facets.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Header, HTTPException, Query
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.services import announce

logger = logging.getLogger("skycave.internal")

router = APIRouter(prefix="/internal", tags=["internal"])


def _guard(secret: str | None) -> None:
    expected = settings.oauth_internal_secret
    if not expected or secret != expected:
        raise HTTPException(status_code=401, detail="unauthorized")


async def _post_to_bluesky(text: str) -> bool:
    """Hand finished text to the sidecar, which owns the credential and facets.
    Fire-and-forget in spirit: never raises into the caller."""
    url = f"{settings.oauth_sidecar_url.rstrip('/')}/internal/announce"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                url,
                json={"text": text},
                headers={"x-internal-secret": settings.oauth_internal_secret},
            )
        if r.status_code != 200:
            logger.error("sidecar announce failed: %s %s", r.status_code, r.text[:200])
            return False
        return True
    except httpx.HTTPError as e:
        logger.error("sidecar announce unreachable: %s", e)
        return False


@router.post("/daily-roundup")
async def daily_roundup(
    x_internal_secret: str | None = Header(default=None),
    dry_run: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Compose and post yesterday's roundup. dry_run returns the text without
    posting, so the cron can be exercised safely and the copy inspected."""
    _guard(x_internal_secret)

    now = datetime.now(timezone.utc)
    end = now.replace(hour=0, minute=0, second=0, microsecond=0)  # today 00:00 UTC
    start = end - timedelta(days=1)  # yesterday 00:00 UTC
    day_label = start.strftime("%b %-d")

    data = await announce.collect_day(db, start, end)
    text = announce.compose_roundup(data, day_label)

    if text is None:
        return {"posted": False, "reason": "quiet day", "text": None}
    if dry_run:
        return {"posted": False, "dry_run": True, "text": text, "chars": len(text)}

    ok = await _post_to_bluesky(text)
    return {"posted": ok, "text": text, "chars": len(text)}


@router.post("/announce-launch")
async def announce_launch(
    text: str = Query(..., min_length=1, max_length=300),
    x_internal_secret: str | None = Header(default=None),
    dry_run: bool = Query(default=False),
) -> dict:
    """Manual one-shot for a new-game launch post. Text is authored by hand at
    launch (there is no launch event to hook), then posted verbatim."""
    _guard(x_internal_secret)
    if dry_run:
        return {"posted": False, "dry_run": True, "text": text}
    ok = await _post_to_bluesky(text)
    return {"posted": ok, "text": text}
