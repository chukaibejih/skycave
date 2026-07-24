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

import logging
import random
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ids import new_room_id
from app.models.tournament import (
    FINISHED,
    IN_PROGRESS,
    LOCKED,
    M_BYE,
    M_DONE,
    M_PENDING,
    M_READY,
    REGISTERING,
    Tournament,
    TournamentEntrant,
    TournamentMatch,
)
from app.services import tournament_engine as eng

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
    """
    now = _now()

    if t.status == REGISTERING and now >= _aware(t.registration_closes_at):
        await lock_and_draw(db, t)

    if t.status == LOCKED and now >= _aware(t.play_opens_at):
        t.status = IN_PROGRESS
        await db.commit()

    return t


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
    await db.commit()
    logger.info(
        "tournament %s drawn: %d entrants, bracket %d, %d rounds",
        locked.id, len(people), locked.bracket_size, rounds,
    )
    return locked


def _match_status(fx: eng.Fixture) -> str:
    if fx.is_bye:
        return M_BYE
    if fx.winner:
        return M_DONE
    if fx.p1 and fx.p2:
        return M_READY
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
        m.status = _match_status(fx)

    champ = eng.champion(fixtures)
    if champ and t.status != FINISHED:
        t.champion_did = champ
        t.status = FINISHED
    await db.commit()


async def create(
    db: AsyncSession,
    *,
    name: str,
    max_players: int,
    registration_closes_at: datetime,
    play_opens_at: datetime,
    play_closes_at: datetime,
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
