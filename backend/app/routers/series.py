"""Head-to-head series endpoints: create, view, join, advance a leg.

A series is a tournament fixture without the bracket. The view is public so a
shared /series/{id} link opens for anyone; creating and joining need an identity
(a guest is fine here, unlike a tournament seat). Advancing a leg opens the next
versus room, tagged so its result reports back to the series.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentIdentity, OptionalIdentity
from app.games.registry import get_game
from app.models.series import LIVE, Series
from app.services import series as svc

router = APIRouter(prefix="/series", tags=["series"])


def _game_name(t: str) -> str:
    g = get_game(t)
    return g.name if g else t


# --------------------------------------------------------------------------- #
# Response shapes
# --------------------------------------------------------------------------- #

class PlayerOut(BaseModel):
    did: str
    name: str
    avatar_url: str | None = None
    wins: int = 0


class SeriesOut(BaseModel):
    id: str
    status: str
    format: str  # "bo3" | "bo5"
    wins_needed: int
    player1: PlayerOut | None = None
    player2: PlayerOut | None = None
    games: list[str] = []
    game_names: list[str] = []
    results: list[dict] = []
    current_leg: int = 0
    current_game: str | None = None
    current_game_name: str | None = None
    current_room_id: str | None = None
    winner_did: str | None = None
    you: str | None = None  # "player1" | "player2" | None


class CreateSeriesIn(BaseModel):
    format: str = "bo3"  # "bo3" | "bo5"


def _serialize(s: Series, viewer_did: str | None) -> SeriesOut:
    w = svc.wins(s)
    p1 = (
        PlayerOut(
            did=s.player1_did,
            name=s.player1_handle or "Player",
            avatar_url=s.player1_avatar,
            wins=w.get(s.player1_did, 0),
        )
        if s.player1_did
        else None
    )
    p2 = (
        PlayerOut(
            did=s.player2_did,
            name=s.player2_handle or "Player",
            avatar_url=s.player2_avatar,
            wins=w.get(s.player2_did, 0),
        )
        if s.player2_did
        else None
    )
    leg = svc.leg_index(s)
    cur = svc.current_game(s)
    rooms = s.rooms or []
    current_room = rooms[leg] if s.status == LIVE and leg < len(rooms) else None

    you = None
    if viewer_did == s.player1_did:
        you = "player1"
    elif viewer_did and viewer_did == s.player2_did:
        you = "player2"

    return SeriesOut(
        id=s.id,
        status=s.status,
        format="bo5" if s.wins_needed >= 3 else "bo3",
        wins_needed=s.wins_needed,
        player1=p1,
        player2=p2,
        games=s.games or [],
        game_names=[_game_name(g) for g in (s.games or [])],
        results=s.results or [],
        current_leg=leg,
        current_game=cur,
        current_game_name=_game_name(cur) if cur else None,
        current_room_id=current_room,
        winner_did=s.winner_did,
        you=you,
    )


@router.post("", response_model=SeriesOut)
async def create_series(
    body: CreateSeriesIn,
    identity: CurrentIdentity,
    db: AsyncSession = Depends(get_db),
) -> SeriesOut:
    wins_needed = 3 if body.format == "bo5" else 2
    s = await svc.create(db, identity, wins_needed)
    return _serialize(s, identity.id)


@router.get("/{series_id}", response_model=SeriesOut)
async def get_series(
    series_id: str,
    identity: OptionalIdentity,
    db: AsyncSession = Depends(get_db),
) -> SeriesOut:
    s = await svc.get(db, series_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Series not found")
    return _serialize(s, identity.id if identity else None)


@router.post("/{series_id}/join", response_model=SeriesOut)
async def join_series(
    series_id: str,
    identity: CurrentIdentity,
    db: AsyncSession = Depends(get_db),
) -> SeriesOut:
    try:
        s = await svc.join(db, series_id, identity)
    except svc.SeriesError as e:
        code = 404 if e.code == "not_found" else 409
        raise HTTPException(status_code=code, detail=e.message)
    return _serialize(s, identity.id)


class NextRoomOut(BaseModel):
    room_id: str


@router.post("/{series_id}/next-game", response_model=NextRoomOut)
async def next_game(
    series_id: str,
    identity: CurrentIdentity,
    db: AsyncSession = Depends(get_db),
) -> NextRoomOut:
    try:
        room_id = await svc.next_room(db, series_id, identity)
    except svc.SeriesError as e:
        code = 404 if e.code == "not_found" else 409
        raise HTTPException(status_code=code, detail=e.message)
    return NextRoomOut(room_id=room_id)
