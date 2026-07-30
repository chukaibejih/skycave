"""What the announcement account will actually say, and how often.

Usage:  python tests/tournament_posts_test.py   (inside the api container)

Two things matter here and neither is provable by reading the composer:

  1. Every post fits Bluesky's 300 characters *with real handles in it*. A
     mention is counted at its full @handle length, and a bracket of 32
     blacksky.app handles is where a naive composer blows the limit.
  2. The cadence. An event queues rounds + 1 posts and not one more, however
     many times the read path runs, because the whole design leans on
     comparison-on-read calling sync_fixtures over and over.

The posts are printed so the copy can be read as a human would see it.
"""
import asyncio
import json
import sys
import uuid
from datetime import datetime, timedelta, timezone

sys.path.insert(0, ".")

from sqlalchemy import delete, select

from app.core.database import AsyncSessionLocal as async_session
from app.models.announcement import AnnouncementOutbox
from app.models.tournament import (
    IN_PROGRESS,
    Tournament,
    TournamentEntrant,
    TournamentMatch,
)
from app.services import tournament as svc
from app.services import tournament_posts as posts

# Long handles on purpose: this is the character budget's worst realistic case.
LONG = "blacksky.app"


def _uid() -> str:
    return uuid.uuid4().hex[:8]


async def _run_tournament(session, players: int, handle_domain: str) -> Tournament:
    """Draw a field, play every fixture 2-0, and let the posts fall out."""
    now = datetime.now(timezone.utc)
    t = Tournament(
        id=f"p{_uid()}",
        name="Skycave Weekend Tournament",
        status=svc.REGISTERING,
        max_players=players,
        registration_closes_at=now + timedelta(hours=1),
        play_opens_at=now - timedelta(hours=1),
        play_closes_at=now + timedelta(hours=72),
    )
    session.add(t)
    await session.commit()
    for i in range(players):
        await svc.register(
            session, t,
            did=f"did:plc:{t.id}p{i}",
            handle=f"player{i}name.{handle_domain}",
            display_name=f"Player {i}",
            avatar_url=None,
        )
    await svc.lock_and_draw(session, t)
    t.status = IN_PROGRESS
    await session.commit()

    for _ in range(200):
        t = await session.get(Tournament, t.id)
        if t.champion_did:
            break
        rows = await svc.matches(session, t.id)
        open_now = [
            m for m in rows if m.winner_did is None and m.player1_did and m.player2_did
        ]
        if not open_now:
            raise AssertionError("stalled with no champion")
        for m in open_now:
            # Two straight wins to player one, recorded the way GAME_END does.
            for leg in range(2):
                await svc.record_result(
                    session, t.id, m.round, m.slot,
                    room_id=f"{t.id}-{m.round}-{m.slot}-{leg}",
                    winner_did=m.player1_did,
                    scores={m.player1_did: 10, m.player2_did: 4},
                )
    return await session.get(Tournament, t.id)


async def _outbox(session, tid: str) -> list[AnnouncementOutbox]:
    return list(
        (
            await session.execute(
                select(AnnouncementOutbox)
                .where(AnnouncementOutbox.dedupe_key.like(f"{tid}:%"))
                .order_by(AnnouncementOutbox.id)
            )
        ).scalars()
    )


async def _cleanup(session, tid: str) -> None:
    await session.execute(
        delete(AnnouncementOutbox).where(AnnouncementOutbox.dedupe_key.like(f"{tid}:%"))
    )
    await session.execute(delete(TournamentMatch).where(TournamentMatch.tournament_id == tid))
    await session.execute(delete(TournamentEntrant).where(TournamentEntrant.tournament_id == tid))
    await session.execute(delete(Tournament).where(Tournament.id == tid))
    await session.commit()


async def test_cadence_and_limit() -> None:
    for players, domain in ((2, "bsky.social"), (5, "bsky.social"), (8, LONG), (16, LONG)):
        async with async_session() as s:
            t = await _run_tournament(s, players, domain)
            try:
                rows = await _outbox(s, t.id)
                expected = t.rounds + 1  # the draw, each round bar the last, the champion
                assert len(rows) == expected, (
                    f"{players} players: expected {expected} posts, got {len(rows)}: "
                    f"{[r.dedupe_key for r in rows]}"
                )
                kinds = [r.kind for r in rows]
                assert kinds[0] == posts.KIND_DRAW, kinds
                assert kinds[-1] == posts.KIND_CHAMPION, kinds
                for r in rows:
                    if r.kind == posts.KIND_DRAW:
                        # The draw is a JSON array of thread posts. The first
                        # leaves room for the hashtags; continuation posts carry
                        # none, so they use the full 300.
                        segs = json.loads(r.text)
                        assert isinstance(segs, list) and segs, r.text
                        assert len(segs[0]) <= posts.BSKY_LIMIT, (
                            f"{players} players draw post 1: {len(segs[0])} over the limit"
                        )
                        for seg in segs[1:]:
                            assert len(seg) <= 300, (
                                f"{players} players draw reply: {len(seg)} over 300"
                            )
                    else:
                        assert len(r.text) <= posts.BSKY_LIMIT, (
                            f"{players} players, {r.dedupe_key}: {len(r.text)} chars over the limit"
                        )
                    assert t.id in r.text, f"{r.dedupe_key} has no bracket link"

                # Nothing is dropped in silence. A draw post that shows some of
                # the fixtures has to admit it, or the entrants missing from it
                # look like they never made the bracket at all.
                draw = rows[0]
                pairs = draw.text.count(" VS ")
                expected_pairs = len(
                    [
                        m for m in await svc.matches(s, t.id)
                        if m.round == 1 and m.player1_did and m.player2_did
                    ]
                )
                assert pairs == expected_pairs or "MORE FIXTURE" in draw.text, (
                    f"{players} players: draw shows {pairs} of {expected_pairs} "
                    f"fixtures and never says so\n{draw.text}"
                )
                for r in rows:
                    if r.text.count("STILL STANDING:"):
                        listed = r.text.split("STILL STANDING:")[1].count("@")
                        assert "+" in r.text or listed >= 2, r.text

                # Reading the tournament again must not queue a single new post.
                before = len(rows)
                for _ in range(3):
                    fresh = await s.get(Tournament, t.id)
                    all_rows = await svc.matches(s, fresh.id)
                    await svc.sync_fixtures(s, fresh, all_rows, svc.to_fixtures(all_rows))
                after = len(await _outbox(s, t.id))
                assert after == before, f"re-reading queued {after - before} duplicate posts"

                print(f"\n{'=' * 70}\n{players} players, @{domain} handles, "
                      f"{t.rounds} rounds -> {len(rows)} posts\n{'=' * 70}")
                for r in rows:
                    print(f"\n--- {r.kind} ({len(r.text)} chars) ---")
                    print(r.text)
            finally:
                await _cleanup(s, t.id)


async def test_a_bye_is_never_posted_as_a_beaten_opponent() -> None:
    """A walkover is not a scalp, and the champion post must not claim one."""
    async with async_session() as s:
        t = await _run_tournament(s, 5, "bsky.social")
        try:
            rows = await _outbox(s, t.id)
            champ_post = next(r for r in rows if r.kind == posts.KIND_CHAMPION)
            # A field of five means three byes; the champion beat at most 2 people
            # in a bracket of eight if they had one, so the claim must be short.
            beaten_line = [ln for ln in champ_post.text.split("\n") if ln.startswith("TOOK OUT ")]
            if beaten_line:
                named = beaten_line[0].count("@")
                assert named <= t.rounds, (
                    f"champion post claims {named} scalps in a {t.rounds}-round event"
                )
            assert "None" not in champ_post.text, champ_post.text
            assert "@ " not in champ_post.text, champ_post.text
            print("\na bye never appears as a beaten opponent")
        finally:
            await _cleanup(s, t.id)


async def test_draw_post_names_the_first_round() -> None:
    async with async_session() as s:
        now = datetime.now(timezone.utc)
        t = Tournament(
            id=f"p{_uid()}", name="Skycave Weekend Tournament", status=svc.REGISTERING,
            max_players=4,
            registration_closes_at=now + timedelta(hours=1),
            play_opens_at=now + timedelta(hours=2),
            play_closes_at=now + timedelta(hours=72),
        )
        s.add(t)
        await s.commit()
        try:
            for i in range(4):
                await svc.register(
                    s, t, did=f"did:plc:{t.id}p{i}", handle=f"p{i}.bsky.social",
                    display_name=f"P{i}", avatar_url=None,
                )
            await svc.lock_and_draw(s, t)
            rows = await _outbox(s, t.id)
            assert len(rows) == 1 and rows[0].kind == posts.KIND_DRAW, [r.kind for r in rows]
            text = rows[0].text
            assert text.count(" VS ") == 2, f"a field of 4 has 2 opening fixtures:\n{text}"
            for i in range(4):
                assert f"@p{i}.bsky.social" in text, f"p{i} was not tagged:\n{text}"
            print("\nthe draw post tags every entrant and names both fixtures")
            print(text)
        finally:
            await _cleanup(s, t.id)


async def main() -> None:
    await test_draw_post_names_the_first_round()
    await test_a_bye_is_never_posted_as_a_beaten_opponent()
    await test_cadence_and_limit()
    print("\n\nPASS: cadence, character budget and dedupe verified")


if __name__ == "__main__":
    asyncio.run(main())
