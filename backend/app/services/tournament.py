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
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
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
    M_SCHEDULED,
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
                # Registration order drives who plays the play-in (the last to
                # sign up), so it must be stable: id breaks a same-instant tie.
                .order_by(TournamentEntrant.registered_at, TournamentEntrant.id)
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

async def _enqueue_play_live(db: AsyncSession, t: Tournament) -> None:
    """Queue the kickoff post, tagging everyone in the FIRST round that opens.

    That is the play-in (round 0) when the field has one, else round one. The old
    version hardcoded round 1, so a play-in field pinged the resting main-draw
    players instead of the play-in players who were actually live. Later rounds
    get their own pre-open heads-up + nudges, not this one-time post.
    """
    rows = await matches(db, t.id)
    if not rows:
        return
    first_round = min(m.round for m in rows)
    last_round = max(m.round for m in rows)
    handle_of = {e.did: e.handle for e in await entrants(db, t.id)}
    players: list[str] = []
    for m in rows:
        if m.round != first_round or not (m.player1_did and m.player2_did):
            continue
        for did in (m.player1_did, m.player2_did):
            h = handle_of.get(did)
            if h:
                players.append(h)
    if not players:
        return
    await posts.enqueue(
        db,
        kind=posts.KIND_LIVE,
        dedupe_key=f"{t.id}:live",
        text=json.dumps(posts.compose_play_live(
            name=t.name, tournament_id=t.id, players=players,
            round=first_round, rounds=last_round,
        )),
    )


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
        # Play just opened: post the kickoff, tagging everyone with a round-one
        # fixture so they are pinged to go play. Dedupe-keyed, so the enqueue is
        # a no-op if this transition is somehow read twice.
        await _enqueue_play_live(db, t)
        await db.commit()

    if t.status in (LOCKED, IN_PROGRESS):
        await apply_forfeits(db, t)

    if t.status == IN_PROGRESS:
        await _open_due_rounds(db, t, now)

    return t


async def _open_due_rounds(db: AsyncSession, t: Tournament, now: datetime) -> None:
    """Flip scheduled fixtures to ready once their window has opened.

    A round opening is a wall-clock event, not a bracket change, so it needs its
    own comparison-on-read pass: sync_fixtures only runs when a result or forfeit
    moves the bracket, and a round whose feeders finished hours ago would sit in
    `scheduled` forever without this.
    """
    rows = await matches(db, t.id)
    changed = False
    for m in rows:
        if m.status == M_SCHEDULED and m.opens_at is not None and now >= _aware(m.opens_at):
            m.status = M_READY
            changed = True
    if changed:
        await db.commit()


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

    field = len(people)
    rng = random.Random()  # a real draw; nothing reproducible about it
    # Entrants arrive in registration order, so build_bracket sends the last to
    # register to the play-in (round 0) and keeps the pairings random.
    fixtures = eng.build_bracket([e.did for e in people], rng)
    eng.advance(fixtures)

    rounds = eng.rounds_for(field)
    overflow = eng.overflow_for(field)
    has_playin = overflow > 0
    base = 0 if has_playin else 1  # the first round number: play-in is round 0

    # One schedule, read once, feeds both the published windows and the enforced
    # per-match deadlines, so the open a player sees and the wall the engine
    # answers to can never drift apart. Snaps off play_opens_at's Thursday.
    windows = eng.round_windows(_aware(locked.play_opens_at), rounds)

    locked.bracket_size = eng.main_size_for(field)
    locked.rounds = rounds
    locked.round_opens = [
        {"round": base + i, "open": o.isoformat()} for i, (o, _c) in enumerate(windows)
    ]
    locked.round_deadlines = [
        {"round": base + i, "deadline": c.isoformat()} for i, (_o, c) in enumerate(windows)
    ]
    # The field's real first round may be later than the Thursday template start
    # (a small field spreads Fri-Sun), so anchor the play-open gate to it.
    locked.play_opens_at = windows[0][0]
    locked.status = LOCKED

    # Seat numbers stabilise the main-draw render. Play-in players sit in their
    # own round-0 section and need no main-draw seat (left None).
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

    now = _now()
    for fx in fixtures:
        # round 0 (play-in) -> the first window; round r -> window r-base.
        w_open, w_close = windows[fx.round - base]
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
                status=_match_status(fx, w_open, now),
                opens_at=w_open,
                deadline=w_close,
            )
        )

    # The draw is news, and the moment every entrant most wants to be tagged.
    # Both posts are threads so nobody is left untagged, and both are queued in
    # the same transaction as the bracket so a drawn tournament always owes them.
    handles = {e.did: e.handle for e in people}

    def _h(did: str | None) -> str | None:
        return handles.get(did) if did else None

    r0 = [fx for fx in fixtures if fx.round == 0]
    r1 = [fx for fx in fixtures if fx.round == 1]
    await posts.enqueue(
        db,
        kind=posts.KIND_DRAW,
        dedupe_key=f"{locked.id}:draw",
        text=json.dumps(posts.compose_draw(
            name=locked.name,
            tournament_id=locked.id,
            entrants=field,
            rounds=rounds,
            round1=[(_h(fx.p1), _h(fx.p2)) for fx in r1],
        )),
    )
    if has_playin:
        await posts.enqueue(
            db,
            kind=posts.KIND_PLAYIN,
            dedupe_key=f"{locked.id}:playin",
            text=json.dumps(posts.compose_play_in(
                tournament_id=locked.id,
                matches=[(_h(fx.p1), _h(fx.p2)) for fx in r0],
            )),
        )
    await db.commit()
    logger.info(
        "tournament %s drawn: %d entrants, bracket %d, %d rounds",
        locked.id, len(people), locked.bracket_size, rounds,
    )
    return locked


def _match_status(
    fx: eng.Fixture,
    opens_at: datetime | None = None,
    now: datetime | None = None,
    was: str | None = None,
) -> str:
    """The fixture's state, without demoting one already under way.

    `was` is the status on the row. A series that has started is `live`, and
    that is not derivable from the fixture alone (an undecided fixture with two
    players looks identical before the first game and between games), so it is
    carried forward rather than recomputed back down to `ready`.

    A fixture with both players known is not playable until its round window
    opens: it is `scheduled` until `opens_at`, then `ready`. This is what stops
    a round going live the instant its feeder finished, hours before its time.
    """
    if fx.winner:
        return M_DONE
    if fx.p1 and fx.p2:
        if was == M_LIVE:
            return M_LIVE
        open_at = _aware(opens_at)
        if open_at is not None and (now or _now()) < open_at:
            return M_SCHEDULED
        return M_READY
    # An empty seat is a contested seat awaiting its play-in winner (or a later
    # round awaiting its feeder): pending, never a bye. Byes are gone.
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
    now = _now()
    by_key = {(f.round, f.slot): f for f in fixtures}
    for m in rows:
        fx = by_key.get((m.round, m.slot))
        if fx is None:
            continue
        m.player1_did = fx.p1
        m.player2_did = fx.p2
        m.results = list(fx.results)
        m.winner_did = fx.winner
        # A newly-seated fixture whose window is still ahead becomes scheduled,
        # not ready: winners feeding in early do not open the next round early.
        m.status = _match_status(fx, m.opens_at, now, m.status)

    champ = eng.champion(fixtures)
    if champ and t.status != FINISHED:
        t.champion_did = champ
        t.status = FINISHED

    await _queue_progress(db, t, fixtures, champ)
    await db.commit()


_EASTERN = ZoneInfo("America/New_York")


def _round_open_map(t: Tournament) -> dict[int, datetime]:
    """round number -> that round's open, from the published windows."""
    out: dict[int, datetime] = {}
    for e in t.round_opens or []:
        try:
            out[int(e["round"])] = _aware(datetime.fromisoformat(e["open"]))
        except (KeyError, ValueError, TypeError):
            continue
    return out


def _opens_when(when: datetime, now: datetime) -> str:
    """An hours-from-now clause: 'IN 4 HOURS'. Players asked for hours rather than
    a day name, so even an overnight gap reads 'IN 14 HOURS', not 'SATURDAY 2PM'."""
    hours = max(1, round((when - now).total_seconds() / 3600))
    return f"IN {hours} HOUR{'S' if hours != 1 else ''}"


async def _current_room(m: TournamentMatch) -> dict | None:
    """The live room for the leg in play, or None if none is open yet."""
    from app.services import room_manager as rm

    leg = leg_index(m)
    open_rooms = list(m.rooms or [])
    if leg < len(open_rooms) and open_rooms[leg]:
        return await rm.get_room(open_rooms[leg])
    return None


def _owes_move(m: TournamentMatch, room: dict | None) -> list[str]:
    """Who still has to act on this fixture, in priority order.

    A player who has not checked in owes that first. Once both are in, a
    turn-based game (its live room carries whose turn it is) pins the single
    player on the clock - the Rose case, asleep on her move. Anything else (a
    simultaneous game, or no room open yet) owes to both.
    """
    p1, p2 = m.player1_did, m.player2_did
    present = list(m.checked_in or [])
    missing = [d for d in (p1, p2) if d and d not in present]
    if missing:
        return missing
    if room is not None:
        game = room.get("game") or {}
        if game.get("mode") == "turn_based":
            turn = (game.get("turn_state") or {}).get("turn")
            if turn in (p1, p2):
                return [turn]
    return [d for d in (p1, p2) if d]


def _nudge_tier(remaining: timedelta) -> str | None:
    """Which nudge a fixture is due, by how long is left on its deadline."""
    if remaining <= timedelta(minutes=25):
        return "last"
    if remaining <= timedelta(minutes=90):
        return "warn"
    return None


async def queue_due_nudges(db: AsyncSession, t: Tournament, now: datetime) -> int:
    """Nudge the player on the clock as a fixture nears its deadline.

    Two tiers, T-90m and T-25m, dedupe-keyed per fixture per tier so each match
    gets at most one of each. Only open, undecided fixtures with both players
    seated are ever nudged; the moment one is decided it drops out.
    """
    if t.status != IN_PROGRESS:
        return 0
    rows = await matches(db, t.id)
    handles = {e.did: e.handle for e in await entrants(db, t.id)}
    queued = 0
    for m in rows:
        if m.winner_did is not None or not (m.player1_did and m.player2_did):
            continue
        if m.opens_at is None or now < _aware(m.opens_at):
            continue  # the round has not opened yet
        if m.deadline is None:
            continue
        remaining = _aware(m.deadline) - now
        if remaining <= timedelta(0):
            continue  # past the wall; the forfeit rules take it, not a nudge
        tier = _nudge_tier(remaining)
        if tier is None:
            continue
        room = await _current_room(m)
        owe = _owes_move(m, room)
        targets = [handles[d] for d in owe if d in handles]
        if not targets:
            continue
        opp = None
        if len(owe) == 1:
            other = m.player2_did if owe[0] == m.player1_did else m.player1_did
            opp = handles.get(other or "")
        ok = await posts.enqueue(
            db,
            kind=posts.KIND_NUDGE,
            dedupe_key=f"{t.id}:nudge:{m.round}:{m.slot}:{tier}",
            text=posts.compose_nudge(
                tournament_id=t.id,
                round=m.round,
                rounds=t.rounds,
                targets=targets,
                opp=opp,
                minutes_left=int(remaining.total_seconds() // 60),
                tier=tier,
            ),
        )
        if ok:
            queued += 1
    if queued:
        await db.commit()
    return queued


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
    # Start at the lowest round present (0 when there is a play-in) so the play-in
    # gets its own "who advanced, next round opens WHEN" summary instead of the
    # play-in resolving in silence. The final round is still the champion's post.
    first_round = min((f.round for f in fixtures), default=1)
    open_map = _round_open_map(t)
    now = _now()

    for rnd in range(first_round, rounds + 1):
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
        # The end-of-round post names when the next round opens, so nobody has to
        # guess whether to keep playing tonight or come back tomorrow.
        next_open = open_map.get(rnd + 1)
        opens_phrase = None
        if next_open is not None:
            lbl, plural = posts.round_label(rnd + 1, rounds)
            verb = "OPEN" if plural else "OPENS"
            opens_phrase = f"{lbl.upper()} {verb} {_opens_when(next_open, now)}"
        # compose_round returns a list of thread posts (a wide round tags every
        # survivor across the thread); store it as JSON like the draw.
        await posts.enqueue(
            db,
            kind=posts.KIND_ROUND,
            dedupe_key=f"{t.id}:round:{rnd}",
            text=json.dumps(posts.compose_round(
                tournament_id=t.id, round=rnd, rounds=rounds, results=results,
                next_opens_phrase=opens_phrase,
            )),
        )

    if not champ:
        return

    final = next((f for f in fixtures if f.round == rounds), None)
    score = None
    if final and final.winner:
        w1, w2 = final.wins()
        score = (w1, w2) if final.winner == final.p1 else (w2, w1)
    card_url = f"{settings.frontend_url.rstrip('/')}/tournament/{t.id}/champion-card"
    await posts.enqueue(
        db,
        kind=posts.KIND_CHAMPION,
        dedupe_key=f"{t.id}:champion",
        text=posts.compose_champion(
            name=t.name,
            tournament_id=t.id,
            champion=handles.get(champ),
            entrants=len(handles),
            final_score=score,
        ),
        image_url=card_url,
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


async def open_room_id(m: TournamentMatch) -> str | None:
    """The room currently open for this leg, if it still exists in Redis."""
    leg = leg_index(m)
    rooms = list(m.rooms or [])
    if leg >= len(rooms):
        return None
    room_id = rooms[leg]
    if not room_id:
        return None
    from app.services import room_manager as rm

    return room_id if await rm.get_room(room_id) is not None else None


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
    if locked.opens_at is not None and _now() < _aware(locked.opens_at):
        raise MatchError("scheduled", "This round has not opened yet.")
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
    if locked.opens_at is not None and _now() < _aware(locked.opens_at):
        raise MatchError("scheduled", "This round has not opened yet.")
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

    await rm.create_room(
        room_id,
        game_type,
        _identity(host),
        mode="versus",
        ttl_seconds=rm.TOURNAMENT_ROOM_TTL_SECONDS,
    )
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
    room["ttl_seconds"] = rm.TOURNAMENT_ROOM_TTL_SECONDS
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
    the series, then the one who checked in when the other didn't, then total
    points, then whoever checked in first (rewarding showing up over raw seed).
    If neither player ever appeared the seat still has to go somewhere or the
    whole bracket stalls behind an empty fixture, so it goes to the higher seed,
    which is at least stated up front rather than decided by a coin nobody sees.

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
                if s1 != s2:
                    fx.winner = fx.p1 if s1 > s2 else fx.p2
                elif fx.p1 in present and fx.p2 in present:
                    # Both showed up but nothing separates them (tied on wins
                    # and points). Reward whoever checked in first - they were
                    # ready and waiting - over raw seed. checked_in is appended
                    # on check-in, so its order is check-in order.
                    fx.winner = (
                        fx.p1 if present.index(fx.p1) < present.index(fx.p2) else fx.p2
                    )
                else:
                    # Neither ever appeared; the seat still has to move, so it
                    # goes to the higher seed, stated up front.
                    fx.winner = fx.p1
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
