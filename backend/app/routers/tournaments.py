"""Tournament endpoints: the public event state, and taking a seat.

The bracket page must work for anyone on Bluesky with no account, so every
read here is public. Only registration needs an identity, and it needs a real
Bluesky one: a guest cannot be tagged in a fixture post or carry a record.

Every read runs `ensure_fresh`, which is what closes registration and draws the
bracket when the deadline passes. There is no scheduler.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import AdminAuth, CurrentIdentity, OptionalIdentity
from app.core.redis_client import get_redis
from app.games.registry import get_game
from app.models import User
from app.models.tournament import FINISHED, M_BYE, M_LIVE, M_READY, REGISTERING, Tournament
from app.services import tournament as svc
from app.services import tournament_engine as eng
from app.websocket.manager import manager

REIGNING_KEY = "tournament:reigning_champion:v1"
REIGNING_TTL = 300  # 5 min; a champion only changes once a weekend

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
    countdown_from: datetime | None = None
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
        countdown_from=t.countdown_from,
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


class TournamentCardOut(BaseModel):
    """A tournament as it appears in the Past weeks list: enough to show a row,
    not the whole bracket."""

    id: str
    name: str
    status: str
    entrants: int
    champion: PlayerOut | None = None
    play_closes_at: datetime
    created_at: datetime


@router.get("/history", response_model=list[TournamentCardOut])
async def history(db: AsyncSession = Depends(get_db)) -> list[TournamentCardOut]:
    """Recent tournaments, newest first. Public: the Past weeks list.

    Defined before /{tournament_id} so the literal path wins over the dynamic
    one. Every entrant for the whole page is fetched in a single query rather
    than one per card.
    """
    ts = await svc.list_tournaments(db, limit=24)
    by_t = await svc.entrants_for(db, [t.id for t in ts])
    cards = []
    for t in ts:
        elist = by_t.get(t.id, [])
        champ = next((e for e in elist if e.did == t.champion_did), None)
        cards.append(
            TournamentCardOut(
                id=t.id,
                name=t.name,
                status=t.status,
                entrants=len(elist),
                champion=(
                    PlayerOut(
                        did=champ.did,
                        handle=champ.handle,
                        display_name=champ.display_name,
                        avatar_url=champ.avatar_url,
                    )
                    if champ
                    else None
                ),
                play_closes_at=t.play_closes_at,
                created_at=t.created_at,
            )
        )
    return cards


class RecordEntryOut(BaseModel):
    tournament_id: str
    name: str
    status: str
    stage: str  # "Champion", "Runner-up", "Semi-finals", "Round 1"...
    is_champion: bool
    series_won: int
    series_lost: int
    played_at: datetime


class RecordOut(BaseModel):
    you: PlayerOut | None = None
    played: int = 0
    titles: int = 0
    entries: list[RecordEntryOut] = []


def _stage(furthest: int, rounds: int, is_champion: bool) -> str:
    """How far a player got, named the way people say it.

    Reaching the final without winning it is "Runner-up", which is a real
    achievement and worth naming as one rather than "lost in the final".
    """
    if is_champion:
        return "Champion"
    if furthest <= 0 or rounds <= 0:
        return "Entered"
    if furthest == rounds:
        return "Runner-up"
    return _round_name(furthest, rounds)


@router.get("/me/record", response_model=RecordOut)
async def my_record(
    identity: CurrentIdentity, db: AsyncSession = Depends(get_db)
) -> RecordOut:
    """The signed-in player's tournament history. Guests have none."""
    if identity.id.startswith("guest:"):
        return RecordOut()
    data = await svc.player_record(db, identity.id)
    entries = [
        RecordEntryOut(
            tournament_id=e["tournament"].id,
            name=e["tournament"].name,
            status=e["tournament"].status,
            stage=_stage(e["furthest_round"], e["rounds"], e["is_champion"]),
            is_champion=e["is_champion"],
            series_won=e["series_won"],
            series_lost=e["series_lost"],
            played_at=e["tournament"].created_at,
        )
        for e in data["entries"]
    ]
    return RecordOut(
        you=PlayerOut(
            did=identity.id,
            handle=identity.handle,
            display_name=identity.display_name,
            avatar_url=identity.avatar_url,
        ),
        played=data["played"],
        titles=data["titles"],
        entries=entries,
    )


class ReigningChampionOut(BaseModel):
    tournament_id: str
    tournament_name: str
    player: PlayerOut


# NOTE: this must stay above "/{tournament_id}" or FastAPI reads "champion" as an
# id. It powers the reigning-champion crown the Avatar draws everywhere, so it is
# a tiny cached read, not a bracket scan.
@router.get("/champion", response_model=ReigningChampionOut | None)
async def reigning_champion(
    db: AsyncSession = Depends(get_db),
) -> ReigningChampionOut | None:
    r = get_redis()
    cached = await r.get(REIGNING_KEY)
    if cached is not None:
        return None if cached == "null" else ReigningChampionOut.model_validate_json(cached)

    t = (
        await db.execute(
            select(Tournament)
            .where(Tournament.status == FINISHED, Tournament.champion_did.is_not(None))
            .order_by(desc(Tournament.created_at))
            .limit(1)
        )
    ).scalars().first()
    champ = await db.get(User, t.champion_did) if t else None
    if not t or not champ:
        await r.set(REIGNING_KEY, "null", ex=REIGNING_TTL)
        return None
    out = ReigningChampionOut(
        tournament_id=t.id,
        tournament_name=t.name,
        player=PlayerOut(
            did=champ.did,
            handle=champ.handle,
            display_name=champ.display_name or champ.handle,
            avatar_url=champ.avatar_url,
        ),
    )
    await r.set(REIGNING_KEY, out.model_dump_json(), ex=REIGNING_TTL)
    return out


class WatchOut(BaseModel):
    round_name: str
    status: str  # "live" | "between" | "waiting" | "finished" | "pending"
    player1: PlayerOut | None = None
    player2: PlayerOut | None = None
    wins: list[int] = [0, 0]
    winner_did: str | None = None
    live_room_id: str | None = None
    spectators: int = 0


@router.get("/{tournament_id}/watch/{round}/{slot}", response_model=WatchOut)
async def watch_match(
    tournament_id: str,
    round: int,
    slot: int,
    db: AsyncSession = Depends(get_db),
) -> WatchOut:
    """Public spectator view of one fixture: who is playing, the series score,
    and the room to watch right now. `live_room_id` is the leg currently in
    play (it advances as each leg opens), or null between legs; the spectator
    client polls this to know which room to watch and when to hop."""
    t = await db.get(Tournament, tournament_id)
    if t is None:
        raise HTTPException(status_code=404, detail="No such tournament")
    m = await svc.find_match(db, tournament_id, round, slot)
    if m is None:
        raise HTTPException(status_code=404, detail="No such fixture")

    people = await svc.entrants(db, tournament_id)
    by_did = {
        e.did: PlayerOut(
            did=e.did, handle=e.handle, display_name=e.display_name, avatar_url=e.avatar_url
        )
        for e in people
    }
    w1 = sum(1 for r in (m.results or []) if r.get("winner") == m.player1_did)
    w2 = sum(1 for r in (m.results or []) if r.get("winner") == m.player2_did)

    live_room_id = await svc.open_room_id(m)
    if m.winner_did:
        status = "finished"
        live_room_id = None  # decided: never point spectators at a stale room
    elif live_room_id:
        status = "live"
    elif m.status == M_LIVE:
        status = "between"  # in progress, but no leg room open right now
    elif m.status == M_READY:
        status = "waiting"  # both known, awaiting check-in / first game
    else:
        status = "pending"

    final_round = max(1, t.bracket_size.bit_length() - 1)
    return WatchOut(
        round_name=_round_name(m.round, final_round),
        status=status,
        player1=by_did.get(m.player1_did or ""),
        player2=by_did.get(m.player2_did or ""),
        wins=[w1, w2],
        winner_did=m.winner_did,
        live_room_id=live_room_id,
        spectators=manager.spectator_count(live_room_id) if live_room_id else 0,
    )


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
# Playing your fixture
# --------------------------------------------------------------------------- #

class LegOut(BaseModel):
    """One game already played in this series, from the viewer's side."""

    game_type: str
    game_name: str
    winner_did: str | None = None
    you_won: bool = False
    drawn: bool = False
    replay: bool = False
    your_score: int = 0
    their_score: int = 0
    room_id: str | None = None


class RunStep(BaseModel):
    """One rung of the ladder the viewer climbed."""

    round: int
    round_name: str
    opponent: PlayerOut | None = None
    your_wins: int = 0
    their_wins: int = 0
    bye: bool = False
    won: bool = False


class MyMatchOut(BaseModel):
    tournament_id: str
    tournament_name: str
    tournament_status: str
    round: int
    slot: int
    round_name: str
    status: str
    you: PlayerOut
    opponent: PlayerOut | None = None
    games: list[str] = []
    game_names: list[str] = []
    current_game: str | None = None
    current_game_name: str | None = None
    # Which game of the best-of-three is next (1-based), ignoring replays.
    game_number: int = 1
    legs: list[LegOut] = []
    your_wins: int = 0
    their_wins: int = 0
    you_checked_in: bool = False
    opponent_checked_in: bool = False
    you_host: bool = False
    room_id: str | None = None
    is_bye: bool = False
    eliminated: bool = False
    won_match: bool = False
    is_champion: bool = False
    deadline: datetime | None = None
    # When the play window opens. Until then the bracket is drawn but nobody may
    # play, so the client shows a disabled "play opens in..." button.
    play_opens_at: datetime
    # Every fixture the viewer has played in this event, earliest first. It is
    # what makes winning feel earned: a champion sees the whole climb, not just
    # the last game.
    run: list[RunStep] = []
    # One line describing what the player should do or wait for next.
    prompt: str = ""


def _round_name(round: int, final_round: int) -> str:
    """Rounds get their real names. `final_round` is the round number of the
    final (log2 of the main-draw size); round 0 is the play-in, and the main
    draw runs 1..final_round, so nobody says "round 3 of 3" about a final."""
    if round == 0:
        return "Play-in"
    left = final_round - round
    if left == 0:
        return "Final"
    if left == 1:
        return "Semi-final"
    if left == 2:
        return "Quarter-final"
    return f"Round {round}"


async def _my_match(
    db: AsyncSession, t: Tournament, did: str
) -> MyMatchOut | None:
    m = await svc.my_match(db, t.id, did)
    if m is None:
        return None
    people = {e.did: e for e in await svc.entrants(db, t.id)}

    def person(d: str | None) -> PlayerOut | None:
        e = people.get(d or "")
        if e is None:
            return None
        return PlayerOut(
            did=e.did, handle=e.handle, display_name=e.display_name, avatar_url=e.avatar_url
        )

    you = person(did)
    if you is None:
        return None
    other_did = m.player2_did if m.player1_did == did else m.player1_did
    first = m.player1_did == did

    legs: list[LegOut] = []
    for r in list(m.results or []):
        w = r.get("winner")
        legs.append(
            LegOut(
                game_type=r.get("game_type", ""),
                game_name=_game_name(r.get("game_type", "")),
                winner_did=w,
                you_won=bool(w) and w == did,
                drawn=w is None,
                replay=bool(r.get("replay")),
                your_score=int(r.get("p1_score" if first else "p2_score") or 0),
                their_score=int(r.get("p2_score" if first else "p1_score") or 0),
                room_id=r.get("room_id"),
            )
        )
    wins = sum(1 for lg in legs if lg.you_won)
    theirs = sum(1 for lg in legs if lg.winner_did and not lg.you_won)

    leg = svc.leg_index(m)
    open_room = await svc.open_room_id(m)

    game = svc.current_game(m)
    is_bye = m.status == M_BYE
    checked = list(m.checked_in or [])
    won = m.winner_did == did
    # The final is at the main-draw depth (log2 of the main-draw size), not the
    # window count, which is one higher when there is a play-in.
    final_round = max(1, t.bracket_size.bit_length() - 1)
    is_final = m.round == final_round

    if is_bye:
        prompt = "You have a bye. You are through to the next round with nothing to play."
    elif m.winner_did and won and is_final:
        prompt = "You won the tournament."
    elif m.winner_did and won:
        prompt = "You are through. Your next opponent is being decided."
    elif m.winner_did:
        prompt = "You are out. Thanks for playing."
    elif other_did is None:
        prompt = "Waiting on the match below yours to finish."
    elif did not in checked:
        prompt = "Check in when you are ready to play."
    elif other_did not in checked:
        prompt = "You are checked in. Waiting for your opponent."
    elif open_room:
        prompt = "Your room is open."
    else:
        prompt = "Both of you are here. Start the game."

    # The climb so far: every fixture they have appeared in that is settled.
    run: list[RunStep] = []
    for row in sorted(await svc.matches(db, t.id), key=lambda r: r.round):
        if did not in (row.player1_did, row.player2_did) or row.winner_did is None:
            continue
        mine_first = row.player1_did == did
        foe = row.player2_did if mine_first else row.player1_did
        w1 = sum(1 for r in (row.results or []) if r.get("winner") == row.player1_did)
        w2 = sum(1 for r in (row.results or []) if r.get("winner") == row.player2_did)
        run.append(
            RunStep(
                round=row.round,
                round_name=_round_name(row.round, final_round),
                opponent=person(foe),
                your_wins=w1 if mine_first else w2,
                their_wins=w2 if mine_first else w1,
                bye=row.status == M_BYE,
                won=row.winner_did == did,
            )
        )

    return MyMatchOut(
        tournament_id=t.id,
        tournament_name=t.name,
        tournament_status=t.status,
        round=m.round,
        slot=m.slot,
        round_name=_round_name(m.round, final_round),
        status=m.status,
        you=you,
        opponent=person(other_did),
        games=list(m.games or []),
        game_names=[_game_name(g) for g in (m.games or [])],
        current_game=game,
        current_game_name=_game_name(game) if game else None,
        game_number=min(
            len([lg for lg in legs if not lg.replay]) + 1, max(1, len(m.games or [])),
        ),
        legs=legs,
        your_wins=wins,
        their_wins=theirs,
        you_checked_in=did in checked,
        opponent_checked_in=bool(other_did) and other_did in checked,
        you_host=svc.host_did(m) == did,
        room_id=open_room,
        is_bye=is_bye,
        eliminated=bool(m.winner_did) and not won,
        won_match=won,
        is_champion=t.champion_did == did,
        deadline=m.deadline,
        play_opens_at=t.play_opens_at,
        run=run,
        prompt=prompt,
    )


async def _live(db: AsyncSession, tournament_id: str) -> Tournament:
    t = await db.get(Tournament, tournament_id)
    if t is None:
        raise HTTPException(status_code=404, detail="No tournament with that id")
    return await svc.ensure_fresh(db, t)


def _require_play_open(t: Tournament) -> None:
    """The bracket is drawn at registration close, but play does not start until
    the play window opens. Block check-in and room-opening until then, so the
    disabled 'play opens in...' button on the client is backed by real gating."""
    opens = t.play_opens_at
    if opens.tzinfo is None:
        opens = opens.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) < opens:
        raise HTTPException(status_code=409, detail="Play has not opened yet.")


@router.get("/{tournament_id}/my-match", response_model=MyMatchOut | None)
async def my_match(
    tournament_id: str,
    identity: CurrentIdentity,
    db: AsyncSession = Depends(get_db),
) -> MyMatchOut | None:
    """The viewer's own fixture: opponent, series so far, and what to do next."""
    t = await _live(db, tournament_id)
    return await _my_match(db, t, identity.id)


@router.post("/{tournament_id}/check-in", response_model=MyMatchOut)
async def check_in(
    tournament_id: str,
    identity: CurrentIdentity,
    db: AsyncSession = Depends(get_db),
) -> MyMatchOut:
    """Say you are here. The room opens once both of you have."""
    t = await _live(db, tournament_id)
    _require_play_open(t)
    m = await svc.my_match(db, t.id, identity.id)
    if m is None:
        raise HTTPException(status_code=404, detail="You have no fixture to play")
    try:
        await svc.check_in(db, m, identity.id)
    except svc.MatchError as e:
        raise HTTPException(status_code=409, detail=e.message)
    out = await _my_match(db, t, identity.id)
    if out is None:
        raise HTTPException(status_code=404, detail="You have no fixture to play")
    return out


@router.post("/{tournament_id}/start", response_model=MyMatchOut)
async def start(
    tournament_id: str,
    identity: CurrentIdentity,
    db: AsyncSession = Depends(get_db),
) -> MyMatchOut:
    """Open (or rejoin) the room for the game in play.

    The same call whether it is game one or the decider, and safe to press
    twice: whoever gets there first mints the room and the other is handed the
    same id. Hosting alternates leg to leg inside `open_leg`, so pressing this
    is never what decides who holds the host seat.
    """
    t = await _live(db, tournament_id)
    _require_play_open(t)
    m = await svc.my_match(db, t.id, identity.id)
    if m is None:
        raise HTTPException(status_code=404, detail="You have no fixture to play")
    people = {e.did: e for e in await svc.entrants(db, t.id)}
    try:
        await svc.open_leg(db, t, m, people)
    except svc.MatchError as e:
        raise HTTPException(status_code=409, detail=e.message)
    out = await _my_match(db, t, identity.id)
    if out is None:
        raise HTTPException(status_code=404, detail="You have no fixture to play")
    return out


# --------------------------------------------------------------------------- #
# Creation (admin)
# --------------------------------------------------------------------------- #

class CreateTournament(BaseModel):
    name: str = "Skycave Weekend Tournament"
    # The full field. The bracket supports up to MAX_FIELD (64); a smaller turnout
    # just fills fewer seats and the rest become round-one byes, so opening at the
    # ceiling costs nothing and never has to be resized mid-week.
    max_players: int = 64
    # Launch flag: start the visible countdown from now instead of the default
    # Wednesday gate. Use for the very first event, opened mid-week, so it counts
    # down from the moment it goes live. Leave false for normal weeks.
    countdown_from_now: bool = False


@router.post("", response_model=TournamentOut)
async def create(
    body: CreateTournament,
    _: AdminAuth,
    db: AsyncSession = Depends(get_db),
) -> TournamentOut:
    """Open the coming weekend's tournament.

    The three anchors are derived, not passed in, so they are always registration
    close Thursday 08:00 Pacific, play open Thursday 18:00 Pacific, hard wall
    Sunday 18:00 Pacific (6pm Pacific / 9pm Eastern is the house standard), and
    cannot be set to something inconsistent by hand.
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
            countdown_from=datetime.now(timezone.utc) if body.countdown_from_now else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return await _serialise(db, t, None)
