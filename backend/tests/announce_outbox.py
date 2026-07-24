"""The announcement outbox drain, against a real database.

Usage:  python tests/announce_outbox.py   (inside the api container)

The outbox exists so that owing a post and sending one are separate acts. What
matters is that the separation actually holds up when the second half fails,
which is the case a live test would never reach: the sidecar URL here points at
a closed port, so every send genuinely cannot connect.

Note the explicit dry_run= on each call. These invoke the endpoint function
directly rather than through FastAPI, so its Query(default=False) arrives as an
unresolved Query object, which is truthy. Passing it is what keeps this test
honest about which path it is exercising.
"""
import asyncio, sys
sys.path.insert(0, ".")
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import delete, select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.announcement import AnnouncementOutbox
from app.models.tournament import Tournament, TournamentEntrant, TournamentMatch
from app.routers import internal
from app.services import tournament as svc

settings.oauth_internal_secret = "test-secret"
settings.oauth_sidecar_url = "http://127.0.0.1:9"  # nothing listens here


async def main():
    async with AsyncSessionLocal() as s:
        now = datetime.now(timezone.utc)
        t = Tournament(
            id="drainx", name="Skycave Weekend Tournament", status=svc.REGISTERING,
            max_players=4, registration_closes_at=now + timedelta(hours=1),
            play_opens_at=now + timedelta(hours=2), play_closes_at=now + timedelta(hours=72),
        )
        s.add(t); await s.commit()
        try:
            for i in range(4):
                await svc.register(s, t, did=f"did:plc:dr{i}", handle=f"d{i}.bsky.social",
                                   display_name=f"D{i}", avatar_url=None)
            await svc.lock_and_draw(s, t)

            try:
                await internal.announce_drain(x_internal_secret="wrong", dry_run=False, db=s)
                raise AssertionError("the drain ran with a wrong secret")
            except HTTPException as e:
                assert e.status_code == 401, e.status_code
            print("the drain refuses a wrong secret")

            dry = await internal.announce_drain(x_internal_secret="test-secret", dry_run=True, db=s)
            mine = [r for r in dry["pending"] if r["key"].startswith("drainx:")]
            assert dry["dry_run"] and len(mine) == 1, dry
            print(f"dry run shows {len(mine)} pending for this event, sends nothing")

            still = (await s.execute(select(AnnouncementOutbox).where(
                AnnouncementOutbox.dedupe_key.like("drainx:%")))).scalars().all()
            assert all(r.posted_at is None and r.attempts == 0 for r in still), "dry run touched rows"

            # Bluesky unreachable: the row is retried later, never lost, never crashes.
            res = await internal.announce_drain(x_internal_secret="test-secret", dry_run=False, db=s)
            assert res["sent"] == 0 and res["failed"] >= 1, res
            row = (await s.execute(select(AnnouncementOutbox).where(
                AnnouncementOutbox.dedupe_key == "drainx:draw"))).scalar_one()
            assert row.posted_at is None and row.attempts == 1 and row.error, (row.attempts, row.error)
            print("an unreachable sidecar counts an attempt and keeps the post owed")

            for _ in range(internal.MAX_ATTEMPTS):
                await internal.announce_drain(x_internal_secret="test-secret", dry_run=False, db=s)
            after = await internal.announce_drain(x_internal_secret="test-secret", dry_run=True, db=s)
            assert not [r for r in after["pending"] if r["key"].startswith("drainx:")], \
                "a post kept retrying past the attempt ceiling"
            print(f"a post that will never send gives up after {internal.MAX_ATTEMPTS} tries")
        finally:
            await s.execute(delete(AnnouncementOutbox).where(AnnouncementOutbox.dedupe_key.like("drainx:%")))
            await s.execute(delete(TournamentMatch).where(TournamentMatch.tournament_id == "drainx"))
            await s.execute(delete(TournamentEntrant).where(TournamentEntrant.tournament_id == "drainx"))
            await s.execute(delete(Tournament).where(Tournament.id == "drainx"))
            await s.commit()
    print("\nPASS: the outbox drain is guarded, safe to dry-run, and survives an outage")

asyncio.run(main())
