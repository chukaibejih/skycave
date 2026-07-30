"""Tournament persistence: registration, the draw, and state transitions.

A thin shell over `tournament_engine` (which holds all the rules and is pure).
This module owns only the database and the clock.

There is no scheduler in this codebase, so lifecycle transitions happen by
comparison-on-read, the same way an empty room expires: every read calls
`ensure_fresh`, which closes registration and draws the bracket once the
deadline has passed. A restart therefore cannot lose a transition, because
nothing is remembered in process.
"""
from __future__ import annotations

import asyncio
import json
import logging
import random
from datetime import datetime, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ids import new_room_id
from app.services.bluesky_auth import fetch_profile
from app.models.tournament import (
    FINISHED,
    IN_PROGRESS,
    LOCKED,
    M_BYE,
    M_DONE,
    M_LIVE,
    M_PENDING,
    M_READY,
    REGISTERING,
    Tournament,
    TournamentEntrant,
    TournamentMatch,
)
from app.services import tournament_engine as eng
from app.services import tournament_posts as posts

logger = logging.getLogger("skycave.tournament")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime | None) -> datetime | None:
    """Postgres can hand back naive datetimes depending on the driver; compare
    everything in UTC so a missing tzinfo can never silently skew a deadline."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# --------------------------------------------------------------------------- #
# Registration
# --------------------------------------------------------------------------- #

class RegistrationError(Exception):
    """Registration refused, with a reason a human can read."""

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


async def register(
    db: AsyncSession,
    tournament: Tournament,
    *,
    did: str,
    handle: str,
    display_name: str,
    avatar_url: str | None,
) -> TournamentEntrant:
    """Take a seat, or refuse with a reason.

    The cap is enforced by locking the tournament row first, so two people
    hitting the last spot at the same moment serialise: the second one counts
    the first and is refused. Doing this with a plain count-then-insert would
    let both through under concurrency.
    """
    if did.startswith("guest:"):
        raise RegistrationError("guests", "Tournament entry needs a Bluesky account.")

    # Serialise concurrent registrations on this tournament.
    locked = (
        await db.execute(
            select(Tournament).where(Tournament.id == tournament.id).with_for_update()
        )
    ).scalar_one()

    # Already in? Hand back the same seat. This has to come before the closed
    # and full checks: someone reopening the page after the field filled (or
    # after registration shut) is still an entrant, and telling them "every spot
    # is taken" when they are holding one of those spots is just wrong.
    seated = (
        await db.execute(
            select(TournamentEntrant).where(
                TournamentEntrant.tournament_id == locked.id,
                TournamentEntrant.did == did,
            )
        )
    ).scalar_one_or_none()
    if seated:
        return seated

    if locked.status != REGISTERING:
        raise RegistrationError("closed", "Registration has closed for this one.")
    if _now() >= _aware(locked.registration_closes_at):
        raise RegistrationError("closed", "Registration has closed for this one.")

    taken = (
        await db.scalar(
            select(func.count())
            .select_from(TournamentEntrant)
            .where(TournamentEntrant.tournament_id == locked.id)
        )
    ) or 0
    if taken >= locked.max_players:
        raise RegistrationError("full", "Every spot is taken. Next one soon.")

    entrant = TournamentEntrant(
        tournament_id=locked.id,
        did=did,
        handle=handle,
        display_name=display_name,
        avatar_url=avatar_url,
    )
    db.add(entrant)
    try:
        await db.commit()
    except IntegrityError:
        # The unique (tournament_id, did) constraint: they are already in.
        await db.rollback()
        existing = (
            await db.execute(
                select(TournamentEntrant).where(
                    TournamentEntrant.tournament_id == locked.id,
                    TournamentEntrant.did == did,
                )
            )
        ).scalar_one_or_none()
        if existing:
            return existing
        raise
    await db.refresh(entrant)
    return entrant


async def entrant_count(db: AsyncSession, tournament_id: str) -> int:
    return (
        await db.scalar(
            select(func.count())
            .select_from(TournamentEntrant)
            .where(TournamentEntrant.tournament_id == tournament_id)
        )
    ) or 0


async def entrants(db: AsyncSession, tournament_id: str) -> list[TournamentEntrant]:
    return list(
        (
            await db.execute(
                select(TournamentEntrant)
                .where(TournamentEntrant.tournament_id == tournament_id)
                .order_by(TournamentEntrant.registered_at)
            )
        ).scalars()
    )


async def matches(db: AsyncSession, tournament_id: str) -> list[TournamentMatch]:
    return list(
        (
            await db.execute(
                select(TournamentMatch)
                .where(TournamentMatch.tournament_id == tournament_id)
                .order_by(TournamentMatch.round, TournamentMatch.slot)
            )
        ).scalars()
    )


# --------------------------------------------------------------------------- #
# Lifecycle, all derived on read
# --------------------------------------------------------------------------- #

async def ensure_fresh(db: AsyncSession, t: Tournament) -> Tournament:
    """Bring a tournament up to date with the clock. Safe on every read.

    registering -> locked   once the deadline passes (draws the bracket)
    locked      -> in_progress once the play window opens
    in_progress -> finished  once the final is decided

    Round deadlines are settled here too, so a fixture nobody turned up for
    cannot hold the round behind it. Same reasoning as the draw: the clock does
    the work on the next read, and a restart cannot lose it.
    """
    now = _now()

    if t.status == REGISTERING and now >= _aware(t.registration_closes_at):
        await lock_and_draw(db, t)

    if t.status == LOCKED and now >= _aware(t.play_opens_at):
        t.status = IN_PROGRESS
        await db.commit()

    if t.status in (LOCKED, IN_PROGRESS):
        await apply_forfeits(db, t)

    return t


# The draw waits this long, in total, for every entrant's profile to come back.
# Past it the stored snapshot is used, which is only ever as wrong as it was a
# moment ago. A slow appview must never be able to hold up a bracket.
REFRESH_BUDGET_SECONDS = 6.0


async def refresh_entrants(people: list[TournamentEntrant]) -> None:
    """Re-resolve every entrant's public profile by DID, just before the draw.

    Identity is snapshotted at registration, which is Thursday at the latest and
    can be days before anyone plays. People rename themselves. A real Skycave
    player went from raythevirgo.latinsky.app to raythediva.latinsky.app, and
    once that happens the stored handle is not merely out of date: an @mention
    of it resolves to nothing, so the announcement post that was supposed to tag
    them silently does not, and their seat on the bracket carries a name they no
    longer use. The DID never moves, so re-resolving by DID fixes handle,
    display name and avatar together.

    Once per tournament, in parallel, best effort. Every failure mode - timeout,
    appview down, a deleted account - falls back to what was already stored.
    """
    async def one(e: TournamentEntrant) -> None:
        profile = await fetch_profile(e.did)
        if not profile:
            return
        if profile["handle"] != e.handle:
            logger.info(
                "entrant %s renamed %s -> %s", e.did, e.handle, profile["handle"]
            )
        e.handle = profile["handle"]
        e.display_name = profile["display_name"]
        e.avatar_url = profile["avatar_url"]

    try:
        await asyncio.wait_for(
            asyncio.gather(*(one(e) for e in people), return_exceptions=True),
            timeout=REFRESH_BUDGET_SECONDS,
        )
    except (asyncio.TimeoutError, Exception):  # noqa: BLE001
        # Deliberately swallowed. A refresh is an improvement, never a
        # precondition; the draw has to happen on time regardless.
        logger.warning("entrant refresh did not finish; using stored profiles")


async def lock_and_draw(db: AsyncSession, t: Tournament) -> Tournament:
    """Close registration and draw the whole bracket, once.

    Re-reads under a row lock so two simultaneous readers cannot both draw.
    A field of fewer than two cannot make a bracket; the tournament is simply
    marked finished with no champion rather than left in a broken half-state.
    """
    locked = (
        await db.execute(
            select(Tournament).where(Tournament.id == t.id).with_for_update()
        )
    ).scalar_one()
    if locked.status != REGISTERING:
        return locked  # someone else already drew it

    people = await entrants(db, locked.id)
    if len(people) < 2:
        locked.status = FINISHED
        locked.bracket_size = 0
        locked.rounds = 0
        await db.commit()
        logger.info("tournament %s closed with %d entrants, no bracket", locked.id, len(people))
        return locked

    await refresh_entrants(people)

    rng = random.Random()  # a real draw; nothing reproducible about it
    fixtures = eng.build_bracket([e.did for e in people], rng)
    eng.apply_byes(fixtures)
    eng.advance(fixtures)

    rounds = eng.rounds_for(len(people))
    deadlines = eng.round_deadlines(
        _aware(locked.play_opens_at), _aware(locked.play_closes_at), rounds
    )

    locked.bracket_size = eng.bracket_size_for(len(people))
    locked.rounds = rounds
    locked.round_deadlines = [
        {"round": i + 1, "deadline": d.isoformat()} for i, d in enumerate(deadlines)
    ]
    locked.status = LOCKED

    # Seat numbers make the published bracket stable to render.
    seat_of = {}
    for fx in fixtures:
        if fx.round != 1:
            continue
        if fx.p1:
            seat_of[fx.p1] = fx.slot * 2
        if fx.p2:
            seat_of[fx.p2] = fx.slot * 2 + 1
    for e in people:
        e.seat = seat_of.get(e.did)

    for fx in fixtures:
        db.add(
            TournamentMatch(
                tournament_id=locked.id,
                round=fx.round,
                slot=fx.slot,
                player1_did=fx.p1,
                player2_did=fx.p2,
                games=list(fx.games),
                results=list(fx.results),
                winner_did=fx.winner,
                status=_match_status(fx),
                deadline=deadlines[fx.round - 1],
            )
        )

    # The draw is news, and it is the moment every entrant most wants to be
    # tagged. Queued inside the same transaction as the bracket itself, so a
    # drawn tournament can never exist without its announcement owed.
    handles = {e.did: e.handle for e in people}
    r1 = [fx for fx in fixtures if fx.round == 1]
    # compose_draw returns an ordered list of thread posts; store it as JSON so
    # the drain can post them as a thread (KIND_DRAW rows carry a JSON array).
    await posts.enqueue(
        db,
        kind=posts.KIND_DRAW,
        dedupe_key=f"{locked.id}:draw",
        text=json.dumps(posts.compose_draw(
            name=locked.name,
            tournament_id=locked.id,
            entrants=len(people),
            rounds=rounds,
            first_round=[
                (handles.get(fx.p1 or ""), handles.get(fx.p2 or ""))
                for fx in r1
                if not fx.is_bye
            ],
            byes=[
                handles.get(fx.p1 or fx.p2 or "", "")
                for fx in r1
                if fx.is_bye
            ],
        )),
    )
    await db.commit()
    logger.info(
        "tournament %s drawn: %d entrants, bracket %d, %d rounds",
        locked.id, len(people), locked.bracket_size, rounds,
    )
    return locked


def _match_status(fx: eng.Fixture, was: str | None = None) -> str:
    """The fixture's state, without demoting one already under way.

    `was` is the status on the row. A series that has started is `live`, and
    that is not derivable from the fixture alone (an undecided fixture with two
    players looks identical before the first game and between games), so it is
    carried forward rather than recomputed back down to `ready`.
    """
    if fx.is_bye:
        return M_BYE
    if fx.winner:
        return M_DONE
    if fx.p1 and fx.p2:
        return M_LIVE if was == M_LIVE else M_READY
    return M_PENDING


def to_fixtures(rows: list[TournamentMatch]) -> list[eng.Fixture]:
    """DB rows -> engine fixtures, so all rule logic stays in one place."""
    return [
        eng.Fixture(
            round=m.round,
            slot=m.slot,
            p1=m.player1_did,
            p2=m.player2_did,
            games=list(m.games or []),
            results=list(m.results or []),
            winner=m.winner_did,
        )
        for m in rows
    ]


async def sync_fixtures(
    db: AsyncSession, t: Tournament, rows: list[TournamentMatch], fixtures: list[eng.Fixture]
) -> None:
    """Write engine state back, advancing winners and crowning a champion."""
    by_key = {(f.round, f.slot): f for f in fixtures}
    for m in rows:
        fx = by_key.get((m.round, m.slot))
        if fx is None:
            continue
        m.player1_did = fx.p1
        m.player2_did = fx.p2
        m.results = list(fx.results)
        m.winner_did = fx.winner
        m.status = _match_status(fx, m.status)

    champ = eng.champion(fixtures)
    if champ and t.status != FINISHED:
        t.champion_did = champ
        t.status = FINISHED

    await _queue_progress(db, t, fixtures, champ)
    await db.commit()


async def _queue_progress(
    db: AsyncSession, t: Tournament, fixtures: list[eng.Fixture], champ: str | None
) -> None:
    """Owe a post for anything that just became true.

    Runs on every sync, and is safe to: the dedupe key is derived from the event
    (round N is done, this tournament has a champion), so the hundredth call
    after a round resolves queues nothing. That is what lets this live on a
    comparison-on-read path with no scheduler anywhere.
    """
    handles = {e.did: e.handle for e in await entrants(db, t.id)}
    rounds = max((f.round for f in fixtures), default=0)
    if not rounds:
        return

    for rnd in range(1, rounds + 1):
        in_round = [f for f in fixtures if f.round == rnd]
        if not in_round or not all(f.decided() for f in in_round):
            continue
        # The final round is the champion's post, not a round summary. Two posts
        # a minute apart saying nearly the same thing reads like a broken bot.
        if rnd == rounds:
            continue
        results = []
        for f in in_round:
            if not f.winner:
                continue
            loser = f.p2 if f.winner == f.p1 else f.p1
            w1, w2 = f.wins()
            wins, losses = (w1, w2) if f.winner == f.p1 else (w2, w1)
            results.append(
                (handles.get(f.winner), handles.get(loser or "") if loser else None,
                 wins, losses)
            )
        # compose_round returns a list of thread posts (a wide round tags every
        # survivor across the thread); store it as JSON like the draw.
        await posts.enqueue(
            db,
            kind=posts.KIND_ROUND,
            dedupe_key=f"{t.id}:round:{rnd}",
            text=json.dumps(posts.compose_round(
                tournament_id=t.id, round=rnd, rounds=rounds, results=results
            )),
        )

    if not champ:
        return

    final = next((f for f in fixtures if f.round == rounds), None)
    score = None
    if final and final.winner:
        w1, w2 = final.wins()
        score = (w1, w2) if final.winner == final.p1 else (w2, w1)
    # Only opponents actually beaten: a bye is not a scalp, and listing one as
    # though it were would be the kind of small lie that makes a bot untrusted.
    beaten = []
    for f in sorted((f for f in fixtures if f.winner == champ), key=lambda f: f.round):
        other = f.p2 if champ == f.p1 else f.p1
        if other and handles.get(other):
            beaten.append(handles[other])
    await posts.enqueue(
        db,
        kind=posts.KIND_CHAMPION,
        dedupe_key=f"{t.id}:champion",
        text=posts.compose_champion(
            name=t.name,
            tournament_id=t.id,
            champion=handles.get(champ),
            entrants=len(handles),
            beaten=beaten,
            final_score=score,
        ),
    )


# --------------------------------------------------------------------------- #
# Playing a fixture: check-in, opening a leg, recording the outcome
# --------------------------------------------------------------------------- #

class MatchError(Exception):
    """A match action refused, with a reason a human can read."""

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


async def find_match(
    db: AsyncSession, tournament_id: str, round: int, slot: int
) -> TournamentMatch | None:
    return (
        await db.execute(
            select(TournamentMatch).where(
                TournamentMatch.tournament_id == tournament_id,
                TournamentMatch.round == round,
                TournamentMatch.slot == slot,
            )
        )
    ).scalar_one_or_none()


async def my_match(
    db: AsyncSession, tournament_id: str, did: str
) -> TournamentMatch | None:
    """The fixture this player should be looking at right now.

    The earliest undecided round they appear in, so a player who has already
    won round one but whose next opponent is still playing sees the round-two
    slot they are waiting in, not the match they have already finished.
    Falls back to their last decided fixture once they are out or have won it
    all, because "how did I do" is the only question left at that point.
    """
    rows = await matches(db, tournament_id)
    mine = [m for m in rows if did in (m.player1_did, m.player2_did)]
    if not mine:
        return None
    live = [m for m in mine if m.winner_did is None]
    if live:
        return min(live, key=lambda m: m.round)
    return max(mine, key=lambda m: m.round)


def leg_index(m: TournamentMatch) -> int:
    """Which sitting is next (0-based). Replays count: each is its own room."""
    return len(m.results or [])


def current_game(m: TournamentMatch) -> str | None:
    """The game to be played now. A replayed draw does not advance the series."""
    games = list(m.games or [])
    if not games:
        return None
    decided = sum(1 for r in (m.results or []) if not r.get("replay"))
    return games[min(decided, len(games) - 1)]


def host_did(m: TournamentMatch) -> str | None:
    """Who holds the host seat for the next leg."""
    if not m.player1_did:
        return None
    return eng.host_for_game(m.player1_did, m.player2_did, leg_index(m))


async def check_in(db: AsyncSession, m: TournamentMatch, did: str) -> TournamentMatch:
    """Mark a player present for their fixture.

    Locked and re-read so two players checking in at the same instant cannot
    each write a list that drops the other. Idempotent.
    """
    locked = (
        await db.execute(
            select(TournamentMatch)
            .where(TournamentMatch.id == m.id)
            .with_for_update()
        )
    ).scalar_one()
    if did not in (locked.player1_did, locked.player2_did):
        raise MatchError("not_yours", "This is not your fixture.")
    if locked.winner_did is not None:
        raise MatchError("decided", "This fixture is already decided.")
    present = list(locked.checked_in or [])
    if did not in present:
        present.append(did)
        locked.checked_in = present
    if len(present) >= 2 and locked.status == M_READY:
        locked.status = M_LIVE
    await db.commit()
    return locked


async def open_leg(
    db: AsyncSession,
    t: Tournament,
    m: TournamentMatch,
    entrants_by_did: dict[str, TournamentEntrant],
) -> str:
    """Return the room for the leg in play, creating it if there isn't one.

    This is the whole "the room appears by itself" promise: neither player ever
    creates a room, picks the game, or sends an invite. Both are seated up
    front, so there is no join step and no window in which one of them is
    sitting in an empty room wondering if the other got the link.

    Serialised on the match row, because both players poll this endpoint and
    two simultaneous callers would otherwise mint two rooms and split the
    fixture across them.
    """
    from app.models import Room
    from app.services import room_manager as rm

    locked = (
        await db.execute(
            select(TournamentMatch)
            .where(TournamentMatch.id == m.id)
            .with_for_update()
        )
    ).scalar_one()

    if locked.winner_did is not None:
        raise MatchError("decided", "This fixture is already decided.")
    if not (locked.player1_did and locked.player2_did):
        raise MatchError("waiting", "Your opponent has not come through yet.")
    present = list(locked.checked_in or [])
    if locked.player1_did not in present or locked.player2_did not in present:
        raise MatchError("check_in", "Both players have to check in first.")
    if t.status not in (LOCKED, IN_PROGRESS):
        raise MatchError("closed", "The tournament is not open for play.")

    leg = leg_index(locked)
    open_rooms = list(locked.rooms or [])
    while len(open_rooms) <= leg:
        open_rooms.append(None)

    existing = open_rooms[leg]
    if existing:
        live = await rm.get_room(existing)
        # A room that finished has already produced a result, which advances the
        # leg, so anything still sitting here either never finished or fell out
        # of Redis. Either way it is dead and this leg deserves a fresh one.
        if live is not None and live.get("status") != "finished":
            return existing

    game_type = current_game(locked)
    host = entrants_by_did.get(host_did(locked) or "")
    other_did = (
        locked.player2_did if host and host.did == locked.player1_did else locked.player1_did
    )
    guest = entrants_by_did.get(other_did or "")
    if host is None or guest is None or game_type is None:
        raise MatchError("broken", "This fixture is missing a player.")

    for _ in range(5):
        room_id = new_room_id()
        if await rm.get_room(room_id) is None:
            break
    else:
        raise MatchError("no_room", "Could not open a room. Try again.")

    await rm.create_room(room_id, game_type, _identity(host), mode="versus")
    await rm.join_room(room_id, _identity(guest))
    # Tag the room with the fixture it belongs to, so the result knows where to
    # go home to and the room UI can show which leg of the series this is.
    room = await rm.get_room(room_id)
    room["tournament"] = {
        "id": t.id,
        "round": locked.round,
        "slot": locked.slot,
        "leg": leg,
        "game_index": sum(1 for r in (locked.results or []) if not r.get("replay")),
    }
    await rm.save_room(room)
    # Deliberately not armed with the no-opponent expiry. That timer exists for
    # a room waiting on an invite link, and it already refuses to fire once a
    # second player is seated. Arming it here would only stamp an `expires_at`
    # the room UI would render as a countdown that can never run out.

    open_rooms[leg] = room_id
    locked.rooms = open_rooms
    if locked.status == M_READY:
        locked.status = M_LIVE
    db.add(
        Room(
            id=room_id,
            game_type=game_type,
            status="waiting",
            host_id=host.did,
            host_handle=host.handle,
        )
    )
    await db.commit()
    logger.info(
        "tournament %s r%ds%d leg %d opened as room %s (%s, host %s)",
        t.id, locked.round, locked.slot, leg, room_id, game_type, host.handle,
    )
    return room_id


def _identity(e: TournamentEntrant) -> dict:
    """An entrant as the identity shape rooms expect."""
    return {
        "id": e.did,
        "handle": e.handle,
        "display_name": e.display_name or e.handle,
        "avatar_url": e.avatar_url,
        "is_guest": False,
    }


async def record_result(
    db: AsyncSession,
    tournament_id: str,
    round: int,
    slot: int,
    *,
    room_id: str,
    winner_did: str | None,
    scores: dict[str, int],
) -> None:
    """Feed a finished tournament game back into the bracket.

    Called off the back of GAME_END. Everything about how a result changes a
    series (replay a draw, 2-0 skips the third, points as the tiebreak) lives
    in the engine; this only maps room scores onto the fixture's seats and
    writes the outcome back.

    Keyed on room id so a duplicated GAME_END cannot score the same game twice.
    """
    t = await db.get(Tournament, tournament_id)
    if t is None:
        return
    rows = await matches(db, tournament_id)
    fixtures = to_fixtures(rows)
    target = next((f for f in fixtures if f.round == round and f.slot == slot), None)
    if target is None or target.decided():
        return
    if any(r.get("room_id") == room_id for r in target.results):
        return  # already counted

    before = len(target.results)
    eng.record_game(
        target,
        winner_did,
        p1_score=int(scores.get(target.p1 or "", 0) or 0),
        p2_score=int(scores.get(target.p2 or "", 0) or 0),
    )
    if len(target.results) > before:
        target.results[-1]["room_id"] = room_id

    eng.advance(fixtures)
    await sync_fixtures(db, t, rows, fixtures)
    logger.info(
        "tournament %s r%ds%d recorded room %s: winner=%s series=%s",
        tournament_id, round, slot, room_id, winner_did, target.wins(),
    )


# --------------------------------------------------------------------------- #
# Forfeits
# --------------------------------------------------------------------------- #

async def apply_forfeits(db: AsyncSession, t: Tournament) -> bool:
    """Past a round deadline, decide anything still open, and move the bracket.

    A knockout with a fixed wall cannot wait for someone who never turned up,
    so the deadline is the referee. In order of preference: whoever is ahead on
    the series, then whoever actually checked in, then total points. If neither
    player ever appeared the seat still has to go somewhere or the whole bracket
    stalls behind an empty fixture, so it goes to the higher seed, which is at
    least stated up front rather than decided by a coin nobody sees.

    Returns True if anything changed.
    """
    if t.status not in (LOCKED, IN_PROGRESS):
        return False
    now = _now()
    rows = await matches(db, t.id)
    fixtures = to_fixtures(rows)
    by_key = {(f.round, f.slot): f for f in fixtures}
    changed = False

    # Run to a fixed point. A later round's fixture has no players until the one
    # feeding it is decided, so a single sweep can only ever settle the earliest
    # unresolved round. If the whole weekend has gone by, every round is past its
    # deadline and the bracket has to unwind all the way to a champion in one go.
    for _ in range(eng.MAX_ROUNDS + 1):
        moved = False
        for m in rows:
            fx = by_key.get((m.round, m.slot))
            if fx is None or fx.decided() or not (fx.p1 and fx.p2):
                continue
            deadline = _aware(m.deadline)
            if deadline is None or now < deadline:
                continue

            w1, w2 = fx.wins()
            present = list(m.checked_in or [])
            if w1 != w2:
                fx.winner = fx.p1 if w1 > w2 else fx.p2
            elif (fx.p1 in present) != (fx.p2 in present):
                fx.winner = fx.p1 if fx.p1 in present else fx.p2
            else:
                s1, s2 = fx.points()
                fx.winner = fx.p1 if s1 >= s2 else fx.p2
            moved = True
            logger.info(
                "tournament %s r%ds%d timed out, awarded to %s",
                t.id, m.round, m.slot, fx.winner,
            )
        if not moved:
            break
        eng.advance(fixtures)
        changed = True

    if changed:
        await sync_fixtures(db, t, rows, fixtures)
    return changed


async def create(
    db: AsyncSession,
    *,
    name: str,
    max_players: int,
    registration_closes_at: datetime,
    play_opens_at: datetime,
    play_closes_at: datetime,
    countdown_from: datetime | None = None,
) -> Tournament:
    if max_players > eng.MAX_FIELD:
        raise ValueError(f"cap {max_players} exceeds the {eng.MAX_FIELD} fairness ceiling")
    t = Tournament(
        id=new_room_id(6),
        name=name,
        max_players=max_players,
        registration_closes_at=registration_closes_at,
        play_opens_at=play_opens_at,
        play_closes_at=play_closes_at,
        countdown_from=countdown_from,
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return t


async def current(db: AsyncSession) -> Tournament | None:
    """The tournament people should currently see: the newest one that has not
    finished, else the most recent finished one so a champion stays visible."""
    live = (
        await db.execute(
            select(Tournament)
            .where(Tournament.status != FINISHED)
            .order_by(Tournament.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if live:
        return await ensure_fresh(db, live)
    return (
        await db.execute(
            select(Tournament).order_by(Tournament.created_at.desc()).limit(1)
        )
    ).scalar_one_or_none()


# --------------------------------------------------------------------------- #
# The tournament world: history and a player's record
# --------------------------------------------------------------------------- #

async def list_tournaments(db: AsyncSession, *, limit: int = 24) -> list[Tournament]:
    """Recent tournaments, newest first, for the Past weeks list."""
    return list(
        (
            await db.execute(
                select(Tournament).order_by(Tournament.created_at.desc()).limit(limit)
            )
        ).scalars()
    )


async def entrants_for(
    db: AsyncSession, tournament_ids: list[str]
) -> dict[str, list[TournamentEntrant]]:
    """All entrants for a set of tournaments, grouped by tournament id.

    One query rather than one per card: the Past weeks list would otherwise fan
    out into a query per tournament just to count heads and name a champion.
    """
    if not tournament_ids:
        return {}
    rows = (
        await db.execute(
            select(TournamentEntrant).where(
                TournamentEntrant.tournament_id.in_(tournament_ids)
            )
        )
    ).scalars()
    grouped: dict[str, list[TournamentEntrant]] = {}
    for e in rows:
        grouped.setdefault(e.tournament_id, []).append(e)
    return grouped


async def player_record(db: AsyncSession, did: str) -> dict:
    """Everything one player has done across every tournament they entered.

    Derived, not stored. Furthest round is read from the matches they actually
    appear in rather than the `eliminated_round` column, which nothing writes;
    a title is the tournament naming them champion. Single elimination means a
    player loses at most one series, so series_lost is 0 or 1, but it is counted
    rather than assumed so the shape survives a future format change.
    """
    entrants = (
        await db.execute(
            select(TournamentEntrant).where(TournamentEntrant.did == did)
        )
    ).scalars().all()
    if not entrants:
        return {"entries": [], "played": 0, "titles": 0}

    tids = [e.tournament_id for e in entrants]
    tourneys = {
        t.id: t
        for t in (
            await db.execute(select(Tournament).where(Tournament.id.in_(tids)))
        ).scalars()
    }
    matches = (
        await db.execute(
            select(TournamentMatch).where(
                TournamentMatch.tournament_id.in_(tids),
                or_(
                    TournamentMatch.player1_did == did,
                    TournamentMatch.player2_did == did,
                ),
            )
        )
    ).scalars().all()
    by_t: dict[str, list[TournamentMatch]] = {}
    for m in matches:
        by_t.setdefault(m.tournament_id, []).append(m)

    entries = []
    titles = 0
    for e in entrants:
        t = tourneys.get(e.tournament_id)
        if t is None:
            continue
        ms = by_t.get(e.tournament_id, [])
        furthest = max((m.round for m in ms), default=0)
        is_champ = t.champion_did == did
        if is_champ:
            titles += 1
        entries.append(
            {
                "tournament": t,
                "rounds": t.rounds,
                "furthest_round": furthest,
                "is_champion": is_champ,
                "series_won": sum(1 for m in ms if m.winner_did == did),
                "series_lost": sum(
                    1 for m in ms if m.winner_did and m.winner_did != did
                ),
            }
        )
    entries.sort(key=lambda x: x["tournament"].created_at, reverse=True)
    return {"entries": entries, "played": len(entries), "titles": titles}
