"""The Hall of Fame: Skycave's permanent record, in one cached read.

Every record here is derived from data already written on the hot paths
(users aggregates, game_sessions, personal_bests, the tournament tables) - no
new tables and no write-hook on game-end. The whole thing is computed at most
once per TTL and served from Redis, exactly like the leaderboard, so a page
load is a cache hit, not a fan of aggregations.

Nothing is invented: a record with no data yet simply comes back null/empty and
the page renders its "not set yet" state, which is the honest thing to show
while the field is still small.
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import desc, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis_client import get_redis
from app.models import GameSession, User
from app.models.game_session import HEAD_TO_HEAD_MODES
from app.models.tournament import FINISHED, Tournament, TournamentEntrant

router = APIRouter(tags=["hall-of-fame"])

CACHE_KEY = "hall_of_fame:v2"
CACHE_TTL = 300  # 5 min; the records barely move, so a stale-ish read is fine
MIN_RATE_GAMES = 10  # a win rate under this many games is noise, not a record

# First-party / dev accounts, excluded from "the very first game" so it
# celebrates a real player's start rather than a test or the house account.
EXCLUDED_DIDS = (
    "did:plc:4rae755aoggod5w22tsmty7h",  # skycave.space
    "did:plc:76il4ns5xbqbsqjwibjgcnsk",  # ibejih.bsky.social
)


# --- response shape -------------------------------------------------------

class Person(BaseModel):
    did: str
    handle: str
    display_name: str | None = None
    avatar_url: str | None = None
    is_guest: bool = False


class Champion(BaseModel):
    tournament_id: str
    tournament_name: str
    date: datetime | None
    player: Person


class TitleHolder(BaseModel):
    player: Person
    titles: int


class StatRecord(BaseModel):
    player: Person
    value: int


class WinRate(BaseModel):
    player: Person
    win_rate: float  # 0..1
    games_played: int
    games_won: int


class BiggestScore(BaseModel):
    player: Person
    game_type: str
    score: int


class FirstGame(BaseModel):
    date: datetime
    game_type: str
    player: Person
    opponent: Person | None = None


class HallOfFame(BaseModel):
    generated_at: datetime
    champions: list[Champion]
    most_titles: TitleHolder | None
    most_wins: StatRecord | None
    most_played: StatRecord | None
    highest_total: StatRecord | None
    best_win_rate: WinRate | None
    biggest_1v1: BiggestScore | None
    first_game: FirstGame | None
    first_champion: Champion | None


# --- identity -------------------------------------------------------------

def _person(u: User) -> Person:
    return Person(did=u.did, handle=u.handle, display_name=u.display_name, avatar_url=u.avatar_url)


async def _resolve(db: AsyncSession, dids: list[str]) -> dict[str, Person]:
    """DID -> Person, from the users table, falling back to a tournament entrant
    snapshot (identity captured at signup) for anyone missing a users row."""
    want = {d for d in dids if d}
    if not want:
        return {}
    out: dict[str, Person] = {}
    for u in (await db.execute(select(User).where(User.did.in_(want)))).scalars():
        out[u.did] = _person(u)
    missing = want - out.keys()
    if missing:
        rows = (
            await db.execute(
                select(TournamentEntrant).where(TournamentEntrant.did.in_(missing))
            )
        ).scalars()
        for e in rows:
            out.setdefault(
                e.did,
                Person(did=e.did, handle=e.handle, display_name=e.display_name, avatar_url=e.avatar_url),
            )
    return out


def _guest_or(person: Person | None, pid: str | None, handle: str | None) -> Person | None:
    """A resolved Person, or a bare guest identity from the inline session handle
    when the id is not a Bluesky DID (the earliest games predate most accounts)."""
    if person:
        return person
    if not pid:
        return None
    return Person(did=pid, handle=handle or "a guest", is_guest=not pid.startswith("did:"))


# --- the build ------------------------------------------------------------

async def _build(db: AsyncSession) -> HallOfFame:
    # Champions roll, newest first.
    tourneys = (
        await db.execute(
            select(Tournament)
            .where(Tournament.status == FINISHED, Tournament.champion_did.is_not(None))
            .order_by(desc(Tournament.play_closes_at))
        )
    ).scalars().all()
    champ_people = await _resolve(db, [t.champion_did for t in tourneys if t.champion_did])

    def champ_of(t: Tournament) -> Champion | None:
        p = champ_people.get(t.champion_did or "")
        if not p:
            return None
        return Champion(
            tournament_id=t.id, tournament_name=t.name, date=t.play_closes_at, player=p
        )

    champions = [c for t in tourneys if (c := champ_of(t))]

    # Most titles - only meaningful once more than one cup has been won.
    most_titles: TitleHolder | None = None
    counts = Counter(t.champion_did for t in tourneys if t.champion_did)
    if len(tourneys) >= 2 and counts:
        did, n = counts.most_common(1)[0]
        if n >= 2 and (p := champ_people.get(did)):
            most_titles = TitleHolder(player=p, titles=n)

    # All-time ladder, straight off the denormalized user aggregates.
    async def _top(order_col, guard) -> User | None:
        return (
            await db.execute(select(User).where(guard).order_by(desc(order_col)).limit(1))
        ).scalars().first()

    mw = await _top(User.games_won, User.games_won > 0)
    mp = await _top(User.games_played, User.games_played > 0)
    ht = await _top(User.total_score, User.total_score > 0)
    most_wins = StatRecord(player=_person(mw), value=mw.games_won) if mw else None
    most_played = StatRecord(player=_person(mp), value=mp.games_played) if mp else None
    highest_total = StatRecord(player=_person(ht), value=ht.total_score) if ht else None

    wr_user = (
        await db.execute(
            select(User)
            .where(User.games_played >= MIN_RATE_GAMES)
            .order_by(desc(User.games_won * 1.0 / User.games_played))
            .limit(1)
        )
    ).scalars().first()
    best_win_rate = (
        WinRate(
            player=_person(wr_user),
            win_rate=round(wr_user.games_won / wr_user.games_played, 3),
            games_played=wr_user.games_played,
            games_won=wr_user.games_won,
        )
        if wr_user and wr_user.games_played
        else None
    )

    # Biggest single 1v1 score ever posted (in any game).
    def side(pid, handle, score):
        return select(
            pid.label("pid"),
            handle.label("handle"),
            score.label("score"),
            GameSession.game_type.label("gt"),
        ).where(GameSession.mode.in_(HEAD_TO_HEAD_MODES))

    plays = union_all(
        side(GameSession.player1_id, GameSession.player1_handle, GameSession.player1_score),
        side(GameSession.player2_id, GameSession.player2_handle, GameSession.player2_score),
    ).subquery()
    top = (
        await db.execute(
            select(plays.c.pid, plays.c.handle, plays.c.score, plays.c.gt)
            .order_by(desc(plays.c.score))
            .limit(1)
        )
    ).first()
    biggest_1v1: BiggestScore | None = None
    if top and (top.score or 0) > 0:
        pe = (await _resolve(db, [top.pid])).get(top.pid)
        person = _guest_or(pe, top.pid, top.handle)
        if person:
            biggest_1v1 = BiggestScore(player=person, game_type=top.gt, score=int(top.score))

    # Firsts, auto-derived from the earliest rows. The house account and dev
    # account are excluded so the very first game is a real player's, not a test.
    fg = (
        await db.execute(
            select(GameSession)
            .where(
                GameSession.player1_id.not_in(EXCLUDED_DIDS),
                (GameSession.player2_id.is_(None))
                | (GameSession.player2_id.not_in(EXCLUDED_DIDS)),
            )
            .order_by(GameSession.created_at.asc())
            .limit(1)
        )
    ).scalars().first()
    first_game: FirstGame | None = None
    if fg:
        ppl = await _resolve(db, [fg.player1_id, fg.player2_id or ""])
        p1 = _guest_or(ppl.get(fg.player1_id), fg.player1_id, fg.player1_handle)
        p2 = _guest_or(ppl.get(fg.player2_id or ""), fg.player2_id, fg.player2_handle)
        if p1:
            first_game = FirstGame(
                date=fg.created_at, game_type=fg.game_type, player=p1, opponent=p2
            )

    first_champion = champions[-1] if champions else None

    return HallOfFame(
        generated_at=datetime.now(timezone.utc),
        champions=champions,
        most_titles=most_titles,
        most_wins=most_wins,
        most_played=most_played,
        highest_total=highest_total,
        best_win_rate=best_win_rate,
        biggest_1v1=biggest_1v1,
        first_game=first_game,
        first_champion=first_champion,
    )


@router.get("/hall-of-fame", response_model=HallOfFame)
async def hall_of_fame(db: AsyncSession = Depends(get_db)) -> HallOfFame:
    r = get_redis()
    cached = await r.get(CACHE_KEY)
    if cached:
        return HallOfFame.model_validate_json(cached)
    resp = await _build(db)
    await r.set(CACHE_KEY, resp.model_dump_json(), ex=CACHE_TTL)
    return resp
