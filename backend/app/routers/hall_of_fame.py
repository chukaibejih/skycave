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
from sqlalchemy import case, desc, func, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis_client import get_redis
from app.models import GameSession, User
from app.models.game_session import HEAD_TO_HEAD_MODES
from app.models.tournament import FINISHED, Tournament, TournamentEntrant
from app.services import reigns

router = APIRouter(tags=["hall-of-fame"])

CACHE_KEY = "hall_of_fame:v6"
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


class LongestReign(BaseModel):
    """The longest anyone has held #1 on a solo leaderboard, measured in days.

    Unlike the other records this one cannot be derived from existing rows alone
    (personal_bests keeps only the current best, not its history), so it reads
    the tracked reign table. `current` is true while the holder is still reigning.
    """
    player: Person
    game_type: str
    days: int
    best_score: int
    current: bool


class HallOfFame(BaseModel):
    generated_at: datetime
    champions: list[Champion]
    most_titles: TitleHolder | None
    most_wins: StatRecord | None
    most_played: StatRecord | None
    longest_streak: StatRecord | None
    best_win_rate: WinRate | None
    biggest_1v1: BiggestScore | None
    longest_reign: LongestReign | None
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

    # All-time ladder. Wins, games played, and win rate are derived from 1v1
    # sessions only (versus + tournament), exactly like the leaderboard, so a
    # heap of solo plays cannot dilute a competitive record - the denormalized
    # users.games_played counts solo too, which was sinking real win rates.
    def _lside(pid, handle):
        return select(
            pid.label("pid"),
            handle.label("handle"),
            case((GameSession.winner_id == pid, 1), else_=0).label("won"),
        ).where(GameSession.mode.in_(HEAD_TO_HEAD_MODES), pid.like("did:%"))

    lplays = union_all(
        _lside(GameSession.player1_id, GameSession.player1_handle),
        _lside(GameSession.player2_id, GameSession.player2_handle),
    ).subquery()
    ladder = (
        select(
            lplays.c.pid,
            func.count().label("played"),
            func.sum(lplays.c.won).label("won"),
        )
        .group_by(lplays.c.pid)
        .subquery()
    )

    mw = (
        await db.execute(
            select(ladder.c.pid, ladder.c.won)
            .where(ladder.c.won > 0)
            .order_by(desc(ladder.c.won))
            .limit(1)
        )
    ).first()
    wr = (
        await db.execute(
            select(ladder.c.pid, ladder.c.won, ladder.c.played)
            .where(ladder.c.played >= MIN_RATE_GAMES)
            .order_by(desc(ladder.c.won * 1.0 / ladder.c.played))
            .limit(1)
        )
    ).first()
    # Longest win streak: the longest run of consecutive 1v1 wins a player has
    # ever strung together. Walk every 1v1 session in chronological order and,
    # for each participant, extend their run on a win and reset it on a loss or
    # a draw. It's a real hot-streak record, unlike a lifetime points sum, which
    # just rewards whoever grinds the highest-scoring game the most. Heavier than
    # the aggregate ladder stats, but it's ~a few hundred rows behind a 5-min
    # cache, so it runs at most once per TTL.
    streak_rows = (
        await db.execute(
            select(
                GameSession.player1_id,
                GameSession.player2_id,
                GameSession.winner_id,
            )
            .where(GameSession.mode.in_(HEAD_TO_HEAD_MODES))
            .order_by(GameSession.created_at.asc(), GameSession.id.asc())
        )
    ).all()
    cur_streak: Counter = Counter()
    best_streak: Counter = Counter()
    for p1, p2, win in streak_rows:
        for pid in (p1, p2):
            if not pid or not pid.startswith("did:"):
                continue
            if pid == win:
                cur_streak[pid] += 1
                if cur_streak[pid] > best_streak[pid]:
                    best_streak[pid] = cur_streak[pid]
            else:
                cur_streak[pid] = 0
    # Most games played is total activity across every mode (solo counts too), so
    # it comes off the denormalized user counter, not the 1v1-only ladder - the
    # most active player, not just the one who plays the most 1v1s.
    mp_user = (
        await db.execute(
            select(User).where(User.games_played > 0).order_by(desc(User.games_played)).limit(1)
        )
    ).scalars().first()

    lp = await _resolve(db, [r.pid for r in (mw, wr) if r])
    most_wins = (
        StatRecord(player=lp[mw.pid], value=int(mw.won or 0)) if mw and mw.pid in lp else None
    )
    most_played = (
        StatRecord(player=_person(mp_user), value=mp_user.games_played) if mp_user else None
    )
    longest_streak: StatRecord | None = None
    if best_streak:
        # Tie-break on the DID only for determinism; the length is what matters.
        top_pid, top_len = max(best_streak.items(), key=lambda kv: (kv[1], kv[0]))
        if top_len >= 2:  # a streak of one isn't a streak
            sp = (await _resolve(db, [top_pid])).get(top_pid)
            if sp:
                longest_streak = StatRecord(player=sp, value=int(top_len))
    best_win_rate = (
        WinRate(
            player=lp[wr.pid],
            win_rate=round(int(wr.won or 0) / int(wr.played), 3),
            games_played=int(wr.played),
            games_won=int(wr.won or 0),
        )
        if wr and wr.played and wr.pid in lp
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

    # Longest #1 reign on any solo board. Sourced from the tracked reign table
    # (the only record here that needs it - see LongestReign), then the holder is
    # resolved to a Person the same way as everyone else.
    longest_reign = None
    top_reigns = await reigns.longest(db, 1)
    if top_reigns:
        tr = top_reigns[0]
        rp = (await _resolve(db, [tr["holder_did"]])).get(tr["holder_did"])
        if rp:
            longest_reign = LongestReign(
                player=rp,
                game_type=tr["game_type"],
                days=tr["days"],
                best_score=tr["best_score"],
                current=tr["current"],
            )

    return HallOfFame(
        generated_at=datetime.now(timezone.utc),
        champions=champions,
        most_titles=most_titles,
        most_wins=most_wins,
        most_played=most_played,
        longest_streak=longest_streak,
        best_win_rate=best_win_rate,
        biggest_1v1=biggest_1v1,
        longest_reign=longest_reign,
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
