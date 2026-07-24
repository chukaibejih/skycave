"""Tournament endpoints: the public event state, and taking a seat.

The bracket page must work for anyone on Bluesky with no account, so every
read here is public. Only registration needs an identity, and it needs a real
Bluesky one: a guest cannot be tagged in a fixture post or carry a record.

Every read runs `ensure_fresh`, which is what closes registration and draws the
bracket when the deadline passes. There is no scheduler.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import AdminAuth, CurrentIdentity, OptionalIdentity
from app.games.registry import get_game
from app.models.tournament import REGISTERING, Tournament
from app.services import tournament as svc
from app.services import tournament_engine as eng

router = APIRouter(prefix="/tournaments", tags=["tournaments"])


# --------------------------------------------------------------------------- #
# Response shapes
# --------------------------------------------------------------------------- #

class PlayerOut(BaseModel):
    did: str
    handle: str
    display_name: str
    avatar_url: str | None = None


class MatchOut(BaseModel):
    round: int
    slot: int
    status: str
    player1: PlayerOut | None = None
    player2: PlayerOut | None = None
    games: list[str] = []
    game_names: list[str] = []
    results: list[dict] = []
    winner_did: str | None = None
    deadline: datetime | None = None
    checked_in: list[str] = []


class TournamentOut(BaseModel):
    id: str
    name: str
    status: str
    max_players: int
    entrants: int
    spots_left: int
    registration_closes_at: datetime
    play_opens_at: datetime
    play_closes_at: datetime
    bracket_size: int
    rounds: int
    round_deadlines: list[dict] = []
    champion: PlayerOut | None = None
    # The full pool, so the registration page can show what might come up.
    game_pool: list[str] = []
    game_pool_names: list[str] = []
    # Present only for the signed-in viewer.
    you: PlayerOut | None = None
    you_registered: bool = False
    players: list[PlayerOut] = []
    matches: list[MatchOut] = []


def _game_name(t: str) -> str:
    g = get_game(t)
    return g.name if g else t


async def _serialise(
    db: AsyncSession, t: Tournament, viewer_did: str | None
) -> TournamentOut:
    people = await svc.entrants(db, t.id)
    by_did = {
        e.did: PlayerOut(
            did=e.did,
            handle=e.handle,
            display_name=e.display_name,
            avatar_url=e.avatar_url,
        )
        for e in people
    }
    rows = await svc.matches(db, t.id)
    out_matches = [
        MatchOut(
            round=m.round,
            slot=m.slot,
            status=m.status,
            player1=by_did.get(m.player1_did or ""),
            player2=by_did.get(m.player2_did or ""),
            games=list(m.games or []),
            game_names=[_game_name(g) for g in (m.games or [])],
            results=list(m.results or []),
            winner_did=m.winner_did,
            deadline=m.deadline,
            checked_in=list(m.checked_in or []),
        )
        for m in rows
    ]
    return TournamentOut(
        id=t.id,
        name=t.name,
        status=t.status,
        max_players=t.max_players,
        entrants=len(people),
        spots_left=max(0, t.max_players - len(people)),
        registration_closes_at=t.registration_closes_at,
        play_opens_at=t.play_opens_at,
        play_closes_at=t.play_closes_at,
        bracket_size=t.bracket_size,
        rounds=t.rounds,
        round_deadlines=list(t.round_deadlines or []),
        champion=by_did.get(t.champion_did or ""),
        game_pool=list(eng.GAME_POOL),
        game_pool_names=[_game_name(g) for g in eng.GAME_POOL],
        you=by_did.get(viewer_did or "") if viewer_did else None,
        you_registered=bool(viewer_did and viewer_did in by_did),
        players=list(by_did.values()),
        matches=out_matches,
    )


# --------------------------------------------------------------------------- #
# Public reads
# --------------------------------------------------------------------------- #

@router.get("/current", response_model=TournamentOut | None)
async def current(
    identity: OptionalIdentity, db: AsyncSession = Depends(get_db)
) -> TournamentOut | None:
    """The tournament to show right now. Public; richer when signed in."""
    t = await svc.current(db)
    if t is None:
        return None
    return await _serialise(db, t, identity.id if identity else None)


@router.get("/{tournament_id}", response_model=TournamentOut)
async def get_one(
    tournament_id: str,
    identity: OptionalIdentity,
    db: AsyncSession = Depends(get_db),
) -> TournamentOut:
    t = await db.get(Tournament, tournament_id)
    if t is None:
        raise HTTPException(status_code=404, detail="No tournament with that id")
    t = await svc.ensure_fresh(db, t)
    return await _serialise(db, t, identity.id if identity else None)


# --------------------------------------------------------------------------- #
# Registration
# --------------------------------------------------------------------------- #

@router.post("/{tournament_id}/register", response_model=TournamentOut)
async def register(
    tournament_id: str,
    identity: CurrentIdentity,
    db: AsyncSession = Depends(get_db),
) -> TournamentOut:
    """Take a seat. Bluesky accounts only, and the cap is enforced atomically."""
    t = await db.get(Tournament, tournament_id)
    if t is None:
        raise HTTPException(status_code=404, detail="No tournament with that id")
    t = await svc.ensure_fresh(db, t)

    try:
        await svc.register(
            db,
            t,
            did=identity.id,
            handle=identity.handle,
            display_name=identity.display_name,
            avatar_url=identity.avatar_url,
        )
    except svc.RegistrationError as e:
        # 409 carries a human-readable reason the page can show as-is.
        raise HTTPException(status_code=409, detail=e.message)

    await db.refresh(t)
    return await _serialise(db, t, identity.id)


# --------------------------------------------------------------------------- #
# Creation (admin)
# --------------------------------------------------------------------------- #

class CreateTournament(BaseModel):
    name: str = "Skycave Weekend Tournament"
    max_players: int = 8


@router.post("", response_model=TournamentOut)
async def create(
    body: CreateTournament,
    _: AdminAuth,
    db: AsyncSession = Depends(get_db),
) -> TournamentOut:
    """Open the coming weekend's tournament.

    The three anchors are derived, not passed in, so they are always Thursday
    08:00 Pacific / Friday 00:00 UTC / Sunday 23:59 UTC and cannot be set to
    something inconsistent by hand.
    """
    closes, opens, play_closes = eng.weekend_anchors(datetime.now(tz=None).astimezone())
    try:
        t = await svc.create(
            db,
            name=body.name,
            max_players=body.max_players,
            registration_closes_at=closes,
            play_opens_at=opens,
            play_closes_at=play_closes,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return await _serialise(db, t, None)
