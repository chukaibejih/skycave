"""The playing half of a tournament, against a real database and Redis.

Usage:  python tests/tournament_series.py   (inside the api container)

tests/tournament_rules.py proves the bracket maths and tests/tournament_db.py
proves registration and the draw. This covers what happens once people actually
turn up: check-in gating, the room opening by itself with both players already
seated, hosting alternating leg to leg, a result finding its way back into the
bracket, a draw being replayed, a sweep skipping the third game, and a fixture
nobody played being settled by its deadline instead of stalling the round.

Nothing here is mocked. Rooms are real Redis rooms and results go through the
same `record_result` the live GAME_END path calls.
"""
import asyncio
import sys
import uuid
from datetime import datetime, timedelta, timezone

sys.path.insert(0, ".")

from sqlalchemy import delete

from app.core.database import AsyncSessionLocal as async_session
from app.models import Room
from app.models.announcement import AnnouncementOutbox
from app.models.tournament import (
    IN_PROGRESS,
    Tournament,
    TournamentEntrant,
    TournamentMatch,
)
from app.core.redis_client import get_redis
from app.services import room_manager as rm
from app.services import tournament as svc


def _uid() -> str:
    return uuid.uuid4().hex[:8]


async def _tournament(session, *, players: int, window: tuple) -> Tournament:
    """A drawn tournament of `players`, already open for play.

    `window` is (opens_delta, closes_delta) from now, so a test can put the
    round deadlines in the future (normal play) or the past (forfeits).
    """
    now = datetime.now(timezone.utc)
    opens, closes = window
    t = Tournament(
        id=f"t{_uid()}",
        name="Test Cup",
        status=svc.REGISTERING,
        max_players=players,
        registration_closes_at=now + timedelta(hours=1),
        play_opens_at=now + opens,
        play_closes_at=now + closes,
    )
    session.add(t)
    await session.commit()

    for i in range(players):
        await svc.register(
            session, t,
            did=f"did:plc:{t.id}p{i}", handle=f"p{i}-{t.id}.bsky.social",
            display_name=f"Player {i}", avatar_url=None,
        )
    await svc.lock_and_draw(session, t)
    t.status = IN_PROGRESS
    await session.commit()
    return t


async def _cleanup(session, t: Tournament) -> None:
    rows = await svc.matches(session, t.id)
    for m in rows:
        for rid in list(m.rooms or []):
            if rid:
                await get_redis().delete(rm._key(rid))
                await session.execute(delete(Room).where(Room.id == rid))
    # Drawing a bracket queues its announcement, so the outbox goes too.
    await session.execute(
        delete(AnnouncementOutbox).where(AnnouncementOutbox.dedupe_key.like(f"{t.id}:%"))
    )
    await session.execute(delete(TournamentMatch).where(TournamentMatch.tournament_id == t.id))
    await session.execute(delete(TournamentEntrant).where(TournamentEntrant.tournament_id == t.id))
    await session.execute(delete(Tournament).where(Tournament.id == t.id))
    await session.commit()


async def _people(session, t: Tournament) -> dict:
    return {e.did: e for e in await svc.entrants(session, t.id)}


def _contested(rows: list[TournamentMatch]) -> TournamentMatch:
    """A round-one fixture with two real players (not a bye)."""
    for m in rows:
        if m.round == 1 and m.player1_did and m.player2_did:
            return m
    raise AssertionError("no contested first-round fixture in this draw")


# --------------------------------------------------------------------------- #

async def test_check_in_gates_the_room() -> None:
    async with async_session() as s:
        t = await _tournament(s, players=4, window=(timedelta(hours=-1), timedelta(hours=72)))
        try:
            m = _contested(await svc.matches(s, t.id))
            people = await _people(s, t)

            try:
                await svc.open_leg(s, t, m, people)
                raise AssertionError("a room opened with nobody checked in")
            except svc.MatchError as e:
                assert e.code == "check_in", e.code

            await svc.check_in(s, m, m.player1_did)
            m = await svc.find_match(s, t.id, m.round, m.slot)
            try:
                await svc.open_leg(s, t, m, people)
                raise AssertionError("a room opened with only one player checked in")
            except svc.MatchError as e:
                assert e.code == "check_in", e.code
            print("no room opens until both players have checked in")

            await svc.check_in(s, m, m.player2_did)
            m = await svc.find_match(s, t.id, m.round, m.slot)
            room_id = await svc.open_leg(s, t, m, people)

            room = await rm.get_room(room_id)
            assert room is not None, "the room was not created in Redis"
            ttl = await get_redis().ttl(rm._key(room_id))
            assert ttl > rm.ROOM_TTL_SECONDS, f"tournament room ttl was too short: {ttl}"
            seated = {p["id"] for p in room["players"]}
            assert seated == {m.player1_did, m.player2_did}, seated
            assert room["game_type"] == m.games[0], (room["game_type"], m.games)
            assert room["tournament"]["id"] == t.id
            assert room["tournament"]["round"] == m.round
            assert room["host_id"] == m.player1_did, "player one hosts game one"
            print("both players are seated on open, in the first drawn game, no invite step")

            # Pressing start twice must not split the fixture across two rooms.
            m = await svc.find_match(s, t.id, m.round, m.slot)
            again = await svc.open_leg(s, t, m, people)
            assert again == room_id, f"a second start minted a new room: {again} != {room_id}"
            print("starting twice returns the same room")
        finally:
            await _cleanup(s, t)


async def test_series_alternates_host_and_advances() -> None:
    async with async_session() as s:
        t = await _tournament(s, players=4, window=(timedelta(hours=-1), timedelta(hours=72)))
        try:
            m = _contested(await svc.matches(s, t.id))
            people = await _people(s, t)
            p1, p2 = m.player1_did, m.player2_did
            games = list(m.games)

            await svc.check_in(s, m, p1)
            m = await svc.find_match(s, t.id, m.round, m.slot)
            await svc.check_in(s, m, p2)

            # Game one: p1 hosts and wins.
            m = await svc.find_match(s, t.id, m.round, m.slot)
            r1 = await svc.open_leg(s, t, m, people)
            assert (await rm.get_room(r1))["host_id"] == p1
            await svc.record_result(
                s, t.id, m.round, m.slot,
                room_id=r1, winner_did=p1, scores={p1: 7, p2: 3},
            )

            m = await svc.find_match(s, t.id, m.round, m.slot)
            assert len(m.results) == 1, m.results
            assert m.winner_did is None, "one win does not take a best of three"
            assert svc.current_game(m) == games[1], "the series did not move to game two"

            # Game two: hosting has swapped, and it is a different game.
            r2 = await svc.open_leg(s, t, m, people)
            assert r2 != r1, "game two reused game one's room"
            room2 = await rm.get_room(r2)
            assert room2["host_id"] == p2, "hosting did not alternate"
            assert room2["game_type"] == games[1], (room2["game_type"], games)
            print("game two opens a fresh room, the other player hosting, the next drawn game")

            await svc.record_result(
                s, t.id, m.round, m.slot,
                room_id=r2, winner_did=p1, scores={p1: 5, p2: 4},
            )

            m = await svc.find_match(s, t.id, m.round, m.slot)
            assert m.winner_did == p1, f"2-0 did not decide the fixture: {m.winner_did}"
            assert len(m.results) == 2, "a decided series played a third game"
            assert m.status == "done", m.status
            print("2-0 takes the series and the third game is never played")

            # And the winner is standing in round two.
            nxt = await svc.find_match(s, t.id, 2, m.slot // 2)
            assert p1 in (nxt.player1_did, nxt.player2_did), (
                f"{p1} won but is not in round two: {nxt.player1_did}/{nxt.player2_did}"
            )
            print("the winner is carried into the next round")

            # A replayed GAME_END for a room already counted must not score twice.
            await svc.record_result(
                s, t.id, m.round, m.slot,
                room_id=r2, winner_did=p1, scores={p1: 5, p2: 4},
            )
            m = await svc.find_match(s, t.id, m.round, m.slot)
            assert len(m.results) == 2, f"a duplicate GAME_END scored again: {m.results}"
            print("a duplicated result for the same room is ignored")
        finally:
            await _cleanup(s, t)


async def test_draw_is_replayed_on_the_same_game() -> None:
    async with async_session() as s:
        t = await _tournament(s, players=4, window=(timedelta(hours=-1), timedelta(hours=72)))
        try:
            m = _contested(await svc.matches(s, t.id))
            people = await _people(s, t)
            p1, p2 = m.player1_did, m.player2_did
            first = m.games[0]

            await svc.check_in(s, m, p1)
            m = await svc.find_match(s, t.id, m.round, m.slot)
            await svc.check_in(s, m, p2)
            m = await svc.find_match(s, t.id, m.round, m.slot)

            r1 = await svc.open_leg(s, t, m, people)
            await svc.record_result(
                s, t.id, m.round, m.slot,
                room_id=r1, winner_did=None, scores={p1: 4, p2: 4},
            )

            m = await svc.find_match(s, t.id, m.round, m.slot)
            assert svc.current_game(m) == first, "a draw moved the series on"
            assert m.results[0]["replay"] is True, m.results[0]

            r2 = await svc.open_leg(s, t, m, people)
            assert r2 != r1
            room2 = await rm.get_room(r2)
            assert room2["game_type"] == first, "the replay is not the same game"
            assert room2["host_id"] == p2, "a replay still alternates the host seat"
            print("a drawn game is replayed as the same game in a new room")
        finally:
            await _cleanup(s, t)


async def test_deadline_settles_a_fixture_nobody_played() -> None:
    async with async_session() as s:
        # A play window entirely in the past: every round deadline has gone.
        t = await _tournament(s, players=4, window=(timedelta(hours=-72), timedelta(hours=-1)))
        try:
            rows = await svc.matches(s, t.id)
            m = _contested(rows)
            present = m.player2_did
            await svc.check_in(s, m, present)

            await svc.apply_forfeits(s, t)

            m = await svc.find_match(s, t.id, m.round, m.slot)
            assert m.winner_did == present, (
                f"the only player who turned up did not get the walkover: {m.winner_did}"
            )
            print("past the deadline, the player who checked in takes the fixture")

            # Nothing is left hanging: the bracket ran itself out to a champion.
            t2 = await s.get(Tournament, t.id)
            assert t2.champion_did, "a fully timed-out bracket did not produce a champion"
            print("a bracket nobody played still resolves rather than stalling")
        finally:
            await _cleanup(s, t)


async def test_a_whole_tournament_to_a_champion() -> None:
    """Play every fixture out properly and check one person is left standing."""
    async with async_session() as s:
        t = await _tournament(s, players=4, window=(timedelta(hours=-1), timedelta(hours=72)))
        try:
            people = await _people(s, t)
            played = 0
            for _ in range(40):  # generous ceiling; a 4-player bracket needs ~6
                t = await s.get(Tournament, t.id)
                if t.champion_did:
                    break
                rows = await svc.matches(s, t.id)
                open_now = [
                    m for m in rows
                    if m.winner_did is None and m.player1_did and m.player2_did
                ]
                if not open_now:
                    raise AssertionError("no playable fixture and no champion: stalled")
                m = open_now[0]
                for did in (m.player1_did, m.player2_did):
                    m = await svc.find_match(s, t.id, m.round, m.slot)
                    await svc.check_in(s, m, did)
                m = await svc.find_match(s, t.id, m.round, m.slot)
                room_id = await svc.open_leg(s, t, m, people)
                # Player one always wins, so every series is a clean 2-0.
                await svc.record_result(
                    s, t.id, m.round, m.slot,
                    room_id=room_id, winner_did=m.player1_did,
                    scores={m.player1_did: 9, m.player2_did: 2},
                )
                played += 1

            t = await s.get(Tournament, t.id)
            assert t.champion_did, "the tournament never produced a champion"
            assert t.status == "finished", t.status
            rows = await svc.matches(s, t.id)
            assert all(m.winner_did for m in rows), "a fixture was left undecided"
            print(f"a 4-player tournament ran to a champion in {played} games, nothing left open")
        finally:
            await _cleanup(s, t)


async def main() -> None:
    await test_check_in_gates_the_room()
    await test_series_alternates_host_and_advances()
    await test_draw_is_replayed_on_the_same_game()
    await test_deadline_settles_a_fixture_nobody_played()
    await test_a_whole_tournament_to_a_champion()
    print("\nPASS: check-in, rooms, series and deadlines verified end to end")


if __name__ == "__main__":
    asyncio.run(main())
