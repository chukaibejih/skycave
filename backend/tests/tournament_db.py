"""Tournament persistence checks against a real database.

Usage:  python tests/tournament_db.py     (run inside the api container, or with
                                           DATABASE_URL pointing at a live db)

The pure bracket maths is covered by tests/tournament_rules.py. This covers the
parts that only a real database can prove: the cap holding under concurrency,
idempotent re-entry, and the lock-on-read draw producing a coherent bracket.
"""
import asyncio
import sys
import uuid
from datetime import datetime, timedelta, timezone

sys.path.insert(0, ".")

from sqlalchemy import delete, select

from app.core.database import AsyncSessionLocal as async_session
from app.models.tournament import Tournament, TournamentEntrant, TournamentMatch
from app.services import tournament as svc


def _uid() -> str:
    return uuid.uuid4().hex[:8]


async def _fresh(session, *, cap: int, closes_in: timedelta) -> Tournament:
    """A tournament open for registration, closing at a controllable moment."""
    now = datetime.now(timezone.utc)
    t = Tournament(
        id=f"t{_uid()}",
        name="Test Cup",
        status=svc.REGISTERING,
        max_players=cap,
        registration_closes_at=now + closes_in,
        play_opens_at=now + closes_in + timedelta(hours=1),
        play_closes_at=now + closes_in + timedelta(hours=73),
    )
    session.add(t)
    await session.commit()
    await session.refresh(t)
    return t


async def _cleanup(session, tid: str) -> None:
    await session.execute(delete(TournamentMatch).where(TournamentMatch.tournament_id == tid))
    await session.execute(delete(TournamentEntrant).where(TournamentEntrant.tournament_id == tid))
    await session.execute(delete(Tournament).where(Tournament.id == tid))
    await session.commit()


async def enter(session, t: Tournament, n: int) -> None:
    await svc.register(
        session, t,
        did=f"did:plc:test{n}", handle=f"p{n}.bsky.social",
        display_name=f"Player {n}", avatar_url=None,
    )


async def test_cap_and_duplicates() -> None:
    async with async_session() as s:
        t = await _fresh(s, cap=4, closes_in=timedelta(hours=1))
        try:
            for i in range(4):
                await enter(s, t, i)
            assert await svc.entrant_count(s, t.id) == 4

            # Cap holds.
            try:
                await enter(s, t, 99)
                raise AssertionError("a 5th entrant got in past a cap of 4")
            except svc.RegistrationError as e:
                assert e.code == "full", e.code

            # Re-entry is idempotent, not a duplicate seat.
            again = await svc.register(
                s, t, did="did:plc:test0", handle="p0.bsky.social",
                display_name="Player 0", avatar_url=None,
            )
            assert again is not None
            assert await svc.entrant_count(s, t.id) == 4, "re-entry created a second seat"

            # Guests cannot enter.
            try:
                await svc.register(
                    s, t, did="guest:abc123", handle="guest",
                    display_name="Guest", avatar_url=None,
                )
                raise AssertionError("a guest got into a tournament")
            except svc.RegistrationError as e:
                assert e.code == "guests", e.code

            print("cap holds at 4, re-entry idempotent, guests refused")
        finally:
            await _cleanup(s, t.id)


async def test_last_spot_race() -> None:
    """Two people hitting the final seat at the same instant: exactly one wins."""
    async with async_session() as setup:
        t = await _fresh(setup, cap=4, closes_in=timedelta(hours=1))
        tid = t.id
        for i in range(3):  # three seats taken, one left
            await enter(setup, t, i)

    async def contend(n: int) -> str:
        # Each contender needs its own session, or they'd share a transaction
        # and the race would not be real.
        async with async_session() as s:
            fresh = (
                await s.execute(select(Tournament).where(Tournament.id == tid))
            ).scalar_one()
            try:
                await svc.register(
                    s, fresh, did=f"did:plc:race{n}", handle=f"race{n}.bsky.social",
                    display_name=f"Racer {n}", avatar_url=None,
                )
                return "in"
            except svc.RegistrationError as e:
                return e.code

    try:
        results = await asyncio.gather(*(contend(n) for n in range(2)))
        async with async_session() as s:
            total = await svc.entrant_count(s, tid)
        got_in = results.count("in")
        print(f"last-spot race: results={results} entrants={total}")
        assert got_in == 1, f"expected exactly one winner of the last seat, got {got_in}"
        assert total == 4, f"cap breached: {total} entrants for a cap of 4"
        print("exactly one racer took the final seat")
    finally:
        async with async_session() as s:
            await _cleanup(s, tid)


async def test_lock_on_read_draws_bracket() -> None:
    """Past the deadline, a plain read locks registration and draws the bracket."""
    async with async_session() as s:
        # Already past its close time, so the next read must lock it.
        t = await _fresh(s, cap=8, closes_in=timedelta(seconds=-5))
        try:
            t.status = svc.REGISTERING
            await s.commit()
            for i in range(5):  # 5 entrants -> bracket of 8, 3 byes, 3 rounds
                ent = TournamentEntrant(
                    tournament_id=t.id, did=f"did:plc:draw{i}",
                    handle=f"d{i}.bsky.social", display_name=f"Drawn {i}",
                    avatar_url=None,
                )
                s.add(ent)
            await s.commit()

            fresh = await svc.ensure_fresh(s, t)
            rows = await svc.matches(s, t.id)
            assert fresh.status != svc.REGISTERING, "read did not close registration"
            assert rows, "no bracket was drawn"

            rounds = {m.round for m in rows}
            r1 = [m for m in rows if m.round == 1]
            byes = [m for m in r1 if m.player2_did is None or m.player1_did is None]
            print(f"5 entrants -> rounds={sorted(rounds)} r1 matches={len(r1)} byes={len(byes)}")
            assert max(rounds) == 3, f"5 entrants needs 3 rounds, got {max(rounds)}"
            assert len(r1) == 4, f"a bracket of 8 has 4 first-round slots, got {len(r1)}"
            assert len(byes) == 3, f"5 in a bracket of 8 means 3 byes, got {len(byes)}"

            for m in rows:
                assert m.games and len(m.games) == 3, f"fixture {m.id} has no 3 games"
                assert len(set(m.games)) == 3, f"fixture {m.id} repeats a game: {m.games}"
            print("every fixture carries three distinct games, published up front")
        finally:
            await _cleanup(s, t.id)


async def main() -> None:
    await test_cap_and_duplicates()
    await test_last_spot_race()
    await test_lock_on_read_draws_bracket()
    print("\nPASS: tournament persistence verified against a real database")


if __name__ == "__main__":
    asyncio.run(main())
