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
from sqlalchemy import select
from fastapi import APIRouter, Header, HTTPException, Query
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.announcement import AnnouncementOutbox
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

    from app.models.roundup import RoundupShoutout

    now = datetime.now(timezone.utc)
    end = now.replace(hour=0, minute=0, second=0, microsecond=0)  # today 00:00 UTC
    start = end - timedelta(days=1)  # yesterday 00:00 UTC
    day_label = start.strftime("%b %-d")

    covered = start.date().isoformat()  # the day this roundup is about
    prev_day = (start - timedelta(days=1)).date().isoformat()

    # Who the last roundup shouted out. The composer steers the standout away
    # from these so a dominant player is never featured two days running.
    prev_row = await db.get(RoundupShoutout, prev_day)
    recent = set(prev_row.handles or []) if prev_row else set()

    data = await announce.collect_day(db, start, end)
    text, featured = announce.compose_roundup(data, day_label, recent=recent)

    if text is None:
        return {"posted": False, "reason": "quiet day", "text": None}
    if dry_run:
        return {
            "posted": False, "dry_run": True, "text": text, "chars": len(text),
            "featured": featured, "suppressed": sorted(recent),
        }

    ok = await _post_to_bluesky(text)
    if ok:
        # Remember today's shout-outs so tomorrow can avoid a back-to-back.
        row = await db.get(RoundupShoutout, covered)
        if row:
            row.handles = featured
        else:
            db.add(RoundupShoutout(day=covered, handles=featured))
        await db.commit()
    return {"posted": ok, "text": text, "chars": len(text), "featured": featured}


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


# --------------------------------------------------------------------------- #
# The outbox
# --------------------------------------------------------------------------- #

# A post that keeps failing is a post with something wrong with it. Give up
# after this many tries rather than hammering Bluesky on every cron tick
# forever; the row stays in the table with its error for a human to look at.
MAX_ATTEMPTS = 5

# A ceiling per drain, so a backlog trickles out rather than arriving as a wall
# of posts in one second, which is what gets an account flagged.
DRAIN_LIMIT = 4


@router.post("/announce-drain")
async def announce_drain(
    x_internal_secret: str | None = Header(default=None),
    dry_run: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Send what the outbox owes, oldest first.

    This is the only place a tournament announcement reaches the network. The
    tournament code itself just writes rows, so nothing a player waits on can
    ever be slowed down or broken by Bluesky being unreachable.

    Driven by the same host cron as the daily roundup. Running it twice over is
    harmless: a sent row is stamped and never looked at again.
    """
    _guard(x_internal_secret)

    pending = (
        await db.execute(
            select(AnnouncementOutbox)
            .where(
                AnnouncementOutbox.posted_at.is_(None),
                AnnouncementOutbox.attempts < MAX_ATTEMPTS,
            )
            .order_by(AnnouncementOutbox.created_at)
            .limit(DRAIN_LIMIT)
        )
    ).scalars().all()

    if dry_run:
        return {
            "dry_run": True,
            "pending": [
                {"kind": r.kind, "key": r.dedupe_key, "chars": len(r.text), "text": r.text}
                for r in pending
            ],
        }

    sent, failed = 0, 0
    for row in pending:
        row.attempts += 1
        if await _post_to_bluesky(row.text):
            row.posted_at = datetime.now(timezone.utc)
            row.error = None
            sent += 1
        else:
            row.error = "sidecar refused or unreachable"
            failed += 1
    await db.commit()
    return {"sent": sent, "failed": failed, "considered": len(pending)}
