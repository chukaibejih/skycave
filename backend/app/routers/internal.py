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

import json
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
from app.models.tournament import (
    FINISHED,
    IN_PROGRESS,
    LOCKED,
    M_DONE,
    M_LIVE,
    M_READY,
    Tournament,
)
from app.services import announce, tournament as svc, tournament_engine as eng
from app.services import tournament_posts as posts

logger = logging.getLogger("skycave.internal")

router = APIRouter(prefix="/internal", tags=["internal"])


def _guard(secret: str | None) -> None:
    expected = settings.oauth_internal_secret
    if not expected or secret != expected:
        raise HTTPException(status_code=401, detail="unauthorized")


async def _post_to_bluesky(
    payload: str | list[str], image_url: str | None = None
) -> bool:
    """Hand finished text to the sidecar, which owns the credential and facets.
    A list posts as a thread (first post tagged, the rest as replies); a string
    posts as a single announcement. `image_url` (single posts only) is a fetchable
    image the sidecar attaches. Fire-and-forget in spirit: never raises."""
    url = f"{settings.oauth_sidecar_url.rstrip('/')}/internal/announce"
    body: dict = {"posts": payload} if isinstance(payload, list) else {"text": payload}
    if image_url and not isinstance(payload, list):
        body["imageUrl"] = image_url
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                url,
                json=body,
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

def _row_payload(row: AnnouncementOutbox) -> str | list[str]:
    """Draw and round rows store a JSON list of thread posts (see
    tournament_posts); hand those to the sidecar as a thread. Everything else is
    a plain string and posts as a single announcement. A plain post is never
    valid JSON, so the parse cleanly distinguishes the two."""
    try:
        data = json.loads(row.text)
        if isinstance(data, list) and data:
            return [str(p) for p in data]
    except (ValueError, TypeError):
        pass
    return row.text


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
                {
                    "kind": r.kind,
                    "key": r.dedupe_key,
                    "chars": len(r.text),
                    "text": r.text,
                    "image_url": r.image_url,
                }
                for r in pending
            ],
        }

    sent, failed = 0, 0
    for row in pending:
        row.attempts += 1
        if await _post_to_bluesky(_row_payload(row), row.image_url):
            row.posted_at = datetime.now(timezone.utc)
            row.error = None
            sent += 1
        else:
            row.error = "sidecar refused or unreachable"
            failed += 1
    await db.commit()
    return {"sent": sent, "failed": failed, "considered": len(pending)}


@router.post("/tournaments/tick")
async def tournament_tick(
    x_internal_secret: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """The time-based heartbeat for a live tournament, driven by a host cron.

    Two jobs, both dedupe-keyed so running every few minutes is safe:
      - a heads-up an hour before each new day's first round opens;
      - a nudge to the player on the clock as a fixture nears its deadline
        (T-90m and T-25m).
    A dedicated timer, so both fire even if no player happens to be polling.
    """
    _guard(x_internal_secret)
    now = datetime.now(timezone.utc)

    t = (
        await db.execute(
            select(Tournament)
            .where(Tournament.status.in_((LOCKED, IN_PROGRESS)))
            .order_by(Tournament.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if t is None:
        return {"status": "no_active", "preopen": 0, "nudges": 0}

    await svc.ensure_fresh(db, t)
    opens = svc._round_open_map(t)
    if not opens:
        return {"status": "not_drawn", "preopen": 0, "nudges": 0}

    # A round can finish ahead of its published window (players don't dawdle) or
    # be left with a stale future window after a live reschedule. Either way its
    # slot in round_opens is no longer something to announce - preopening "THE
    # SEMI-FINALS OPEN IN 1 HOUR" after the semis are already done is exactly the
    # bug this guards. Drop any round that has already opened or been decided;
    # only rounds still wholly scheduled are genuinely upcoming.
    rows = await svc.matches(db, t.id)
    started = {m.round for m in rows if m.status in (M_READY, M_LIVE, M_DONE)}
    opens = {r: w for r, w in opens.items() if r not in started}
    if not opens:
        return {"status": "ok", "preopen": 0, "nudges": await svc.queue_due_nudges(db, t, now)}

    # 1. The first round on each Pacific calendar day gets a one-hour heads-up.
    day_first: dict = {}
    for rnd, when in opens.items():
        day = when.astimezone(eng.PACIFIC).date()
        if day not in day_first or when < day_first[day][1]:
            day_first[day] = (rnd, when)

    preopen = 0
    for rnd, when in day_first.values():
        if when - timedelta(hours=1) <= now < when:
            ok = await posts.enqueue(
                db,
                kind=posts.KIND_PREOPEN,
                dedupe_key=f"{t.id}:preopen:{rnd}",
                text=posts.compose_preopen(
                    tournament_id=t.id,
                    round=rnd,
                    rounds=t.rounds,
                    opens_phrase=svc._opens_when(when, now),
                ),
            )
            if ok:
                preopen += 1
    if preopen:
        await db.commit()

    # 2. Nudge whoever is on the clock as a fixture nears its deadline.
    nudges = await svc.queue_due_nudges(db, t, now)

    return {"status": "ok", "preopen": preopen, "nudges": nudges}


# Fortnightly cadence: the cron runs every Saturday, but a cup is only created
# when the last one was created at least this many days ago. A weekly gap is 7
# days and a fortnightly gap is 14, so any threshold between them makes rotate
# skip the "off" Saturday and fire the next. Lower this toward 7 to go weekly.
ROTATE_MIN_GAP_DAYS = 11


@router.post("/tournaments/rotate")
async def rotate_tournament(
    x_internal_secret: str | None = Header(default=None),
    dry_run: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create the coming weekend's tournament if no active one exists, and post the signup announcement.

    Driven by host cron (e.g. Saturday 8:00 AM Pacific / 15:00 UTC). Registration
    opens Saturday and play is the following weekend (windows anchor to the next
    Thursday). Safe to run repeatedly: if an active non-finished tournament
    exists, it is a no-op.
    """
    _guard(x_internal_secret)

    now = datetime.now(timezone.utc)
    closes, opens, play_closes = eng.weekend_anchors(now)

    existing = (
        await db.execute(
            select(Tournament)
            .where(Tournament.status != FINISHED)
            .order_by(Tournament.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if existing:
        return {
            "status": "already_exists",
            "tournament_id": existing.id,
            "tournament_status": existing.status,
            "announced": False,
        }

    # Fortnightly gate: skip the "off" Saturday. Runs every Saturday but only
    # creates when the most recent cup (any status) is old enough, so the cadence
    # is every two weeks without the cron needing to know which Saturday it is.
    recent = (
        await db.execute(
            select(Tournament).order_by(Tournament.created_at.desc()).limit(1)
        )
    ).scalar_one_or_none()
    if recent is not None and recent.created_at is not None:
        created = recent.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        age = now - created
        if age < timedelta(days=ROTATE_MIN_GAP_DAYS):
            return {
                "status": "too_soon",
                "reason": f"last cup created {age.days}d ago; fortnightly gate is {ROTATE_MIN_GAP_DAYS}d",
                "last_tournament_id": recent.id,
                "next_eligible_at": (created + timedelta(days=ROTATE_MIN_GAP_DAYS)).isoformat(),
                "announced": False,
            }

    # Registration opens Saturday and play is the following weekend, so this is
    # "the next" tournament, not "this weekend's" (which read wrong once the
    # signup post moved to a Saturday).
    announcement_text = (
        "Registration is now open for the next Skycave Tournament! 🏆\n\n"
        "Claim your seat before registration closes on Thursday.\n\n"
        "Claim your spot here: skycave.space/tournament"
    )

    if dry_run:
        return {
            "status": "dry_run",
            "would_create": {
                "name": "Skycave Weekend Tournament",
                "max_players": 64,
                "registration_closes_at": closes.isoformat(),
                "play_opens_at": opens.isoformat(),
                "play_closes_at": play_closes.isoformat(),
            },
            "announcement_text": announcement_text,
        }

    t = await svc.create(
        db,
        name="Skycave Weekend Tournament",
        max_players=64,
        registration_closes_at=closes,
        play_opens_at=opens,
        play_closes_at=play_closes,
    )

    announced = await _post_to_bluesky(announcement_text)
    return {
        "status": "created",
        "tournament_id": t.id,
        "registration_closes_at": t.registration_closes_at.isoformat(),
        "announced": announced,
    }

