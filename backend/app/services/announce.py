"""Compose the daily results roundup posted by the @skycave.space account.

The *posting* happens in the Node sidecar (it has @atproto/api and can turn
@handles into real Bluesky mention facets). This module only builds the text.

The shape was approved with real data:
  - a **mix**: a multi-line recap on busy days, a single highlight + challenge
    on quiet ones;
  - **skip quiet days** entirely rather than post a sad empty roundup;
  - **spread the spotlight**: prefer leading with a newcomer or a first-win, and
    always feature a second, different player when the day allows, so the post
    never becomes the same-name channel.

`compose_roundup` is a pure function of a day's already-gathered data, so it is
unit-tested against real production numbers without touching a database.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.games.registry import get_game

# A day needs at least this much to be worth a post; below it, stay silent.
QUIET_MIN_GAMES = 4
QUIET_MIN_PLAYERS = 2
# At or above this, the day is "busy" and gets the fuller multi-line recap.
BUSY_MIN_GAMES = 10
BUSY_MIN_PLAYERS = 3

BSKY_LIMIT = 300  # a Bluesky post's hard character ceiling


def _game_name(game_type: str) -> str:
    g = get_game(game_type)
    return g.name if g else game_type


def _solo_name(name: str) -> str:
    """A name for a solo highlight. Some names bake in a mode (e.g. "GeoGuess
    1v1"), which reads wrong on a solo score, so trim a trailing 1v1."""
    return re.sub(r"\s*1v1$", "", name, flags=re.IGNORECASE)


def _slug(game_type: str) -> str:
    return game_type.replace("_", "-")


def _at(handle: str) -> str:
    """A taggable mention. Guests carry the literal handle 'guest' and are never
    tagged; the caller is expected to have filtered them, this is a backstop."""
    return f"@{handle}" if handle and handle != "guest" else handle


@dataclass
class Highlight:
    handle: str
    game_type: str
    score: int


@dataclass
class DayData:
    """Everything the composer needs about one day, already de-guested."""

    total_games: int = 0
    named_players: set[str] = field(default_factory=set)
    # Best solo score per (handle, game), highest first.
    top_solo: list[Highlight] = field(default_factory=list)
    # 1v1 wins as (winner_handle, game_type), most recent day's decisive games.
    versus_wins: list[tuple[str, str]] = field(default_factory=list)
    # Handles whose first-ever WIN landed today (the milestone).
    first_wins: list[str] = field(default_factory=list)
    # Handles whose first-ever GAME landed today (a newcomer to feature).
    newcomers: list[str] = field(default_factory=list)


# Per-game phrasing for a standout score. Falls back to a generic line.
def _score_line(h: Highlight) -> str:
    name = _game_name(h.game_type)
    who = _at(h.handle)
    if h.game_type == "clay":
        return f"{who} SHAPED A {h.score} ON CLAY \U0001f3fa"  # 🏺
    if h.game_type == "uno":
        return f"{who} RAN THE UNO TABLE"
    if h.game_type == "tile_takeover":
        return f"{who} FLOODED THE BOARD IN TILE TAKEOVER"
    return f"{who} TOPPED {_solo_name(name).upper()} WITH {h.score:,}"


def _versus_line(handle: str, game_types: list[str]) -> str:
    who = _at(handle)
    names = [_game_name(g).upper() for g in game_types]
    if len(names) == 1:
        return f"{who} TOOK {names[0]}"
    if len(names) == 2:
        return f"{who} TOOK {names[0]} AND {names[1]}"
    return f"{who} TOOK {names[0]}, {names[1]} AND MORE"


def compose_roundup(
    data: DayData, day_label: str, recent: set[str] | None = None
) -> tuple[str | None, list[str]]:
    """The day's post and the handles it featured, or (None, []) to stay silent.

    day_label is a short human date like "Jul 22" used only on the quiet-day form.
    `recent` is who the previous roundup shouted out; the standout score steers
    away from them so a dominant player is never featured two days running. The
    returned handles are recorded so tomorrow can do the same.
    """
    recent = recent or set()

    # Guardrail 1: skip quiet days.
    if data.total_games < QUIET_MIN_GAMES or len(data.named_players) < QUIET_MIN_PLAYERS:
        return None, []

    busy = data.total_games >= BUSY_MIN_GAMES and len(data.named_players) >= BUSY_MIN_PLAYERS

    # The lead, by spotlight priority: a first-win milestone, else a brand-new
    # player, else the day's standout score. This is what stops the top scorer
    # from leading every single day.
    lead: str | None = None
    lead_handle: str | None = None
    if data.first_wins:
        h = data.first_wins[0]
        lead = f"\U0001f389 {_at(h)} JUST GOT THEIR FIRST SKYCAVE WIN. WELCOME TO THE CAVE."
        lead_handle = h
    elif data.newcomers:
        h = data.newcomers[0]
        lead = f"\U0001f44b {_at(h)} STEPPED INTO THE CAVE FOR THE FIRST TIME YESTERDAY."
        lead_handle = h

    used: set[str] = {lead_handle} if lead_handle else set()
    # The standout score, avoiding the lead and yesterday's shout-outs.
    star = _pick_star(data.top_solo, used, recent)
    featured: list[str] = []

    # --- Quiet day: one highlight + a challenge (Option B) ---
    if not busy:
        if lead:
            featured.append(lead_handle)  # type: ignore[arg-type]
            body = lead
            if star and star.handle != lead_handle:
                body += f"\n\nALSO YESTERDAY: {_score_line(star)}."
                featured.append(star.handle)
            tail = "\n\nCOME PLAY: skycave.space"
        elif star:
            body = f"YESTERDAY'S TOP SCORE: {_score_line(star)}"
            featured.append(star.handle)
            tail = f"\n\nTHINK YOU CAN BEAT IT? skycave.space/play/{_slug(star.game_type)}"
        else:
            return None, []
        return _fit(body + tail), featured

    # --- Busy day: a short recap (Option A) ---
    lines: list[str] = ["YESTERDAY IN THE CAVE \U0001f3ae"]  # 🎮
    body_lines: list[str] = []

    if lead:
        body_lines.append(lead)
        featured.append(lead_handle)  # type: ignore[arg-type]

    # The standout score, if its player isn't already the lead.
    if star and star.handle not in used:
        body_lines.append(f"{_score_line(star)}.")
        used.add(star.handle)
        featured.append(star.handle)

    # Spotlight spread: pull in a *different* winner than everyone so far.
    other = _second_voice(data, used)
    if other:
        other_handle, other_line = other
        body_lines.append(f"{other_line}.")
        featured.append(other_handle)

    if not body_lines:
        return None, []

    post = lines[0] + "\n\n" + "\n".join(body_lines) + "\n\nYOUR MOVE: skycave.space"
    return _fit(post), featured


def _pick_star(top_solo: list[Highlight], used: set[str], recent: set[str]) -> Highlight | None:
    """The standout score. Skip anyone already in the post, and prefer someone
    who was NOT shouted out in the previous roundup, so the top player does not
    headline two days running. Only if nobody else scored do we allow a repeat,
    since a real highlight beats going silent."""
    fresh = [h for h in top_solo if h.handle not in used and h.handle not in recent]
    if fresh:
        return fresh[0]
    rest = [h for h in top_solo if h.handle not in used]
    return rest[0] if rest else None


def _second_voice(data: DayData, used: set[str]) -> tuple[str, str] | None:
    """A recap (handle, line) for a player not yet featured, preferring a lighter
    name so the spotlight spreads beyond the day's heaviest player."""
    # Aggregate 1v1 wins by handle, skipping anyone already featured.
    by_handle: dict[str, list[str]] = {}
    for handle, gt in data.versus_wins:
        if handle in used or handle == "guest":
            continue
        by_handle.setdefault(handle, [])
        if gt not in by_handle[handle]:
            by_handle[handle].append(gt)
    if not by_handle:
        # Fall back to a second solo scorer.
        for h in data.top_solo:
            if h.handle not in used and h.handle != "guest":
                return h.handle, _score_line(h)
        return None
    # Prefer the handle with the FEWEST wins (the lighter player), to spread it.
    handle = min(by_handle, key=lambda h: len(by_handle[h]))
    return handle, _versus_line(handle, by_handle[handle])


def _fit(text: str) -> str:
    """Keep the post under Bluesky's limit by dropping trailing lines, never the
    lead. Mentions count as their full @handle length, which is what we measure."""
    if len(text) <= BSKY_LIMIT:
        return text
    parts = text.split("\n\n")
    while len(parts) > 2 and len("\n\n".join(parts)) > BSKY_LIMIT:
        # Drop the second-to-last block (a supporting line), keep lead + CTA.
        parts.pop(-2)
    return "\n\n".join(parts)[:BSKY_LIMIT]


# --------------------------------------------------------------------------- #
# Leaderboard takeover: a standalone "new #1" post
# --------------------------------------------------------------------------- #
# Reserved for a genuine changing of the guard - dethroning a long reign, or
# ending the longest reign on record. Everyday #1 churn stays in the daily
# roundup, so this post keeps its weight. These are meant to read like a sports
# desk calling a moment, not a system printing a row: sentence case, both players
# tagged, and a small pool of approved variants selected deterministically so a
# rare event never sounds like the same bot every time.

# Leave room for the sidecar's appended "#blacksky #blackskygamers" under the 300
# ceiling; a variant that overflows (long handles) is dropped from the draw.
_TAKEOVER_LIMIT = 272


def _reign_variants(new: str, old: str, game: str, days: int, score: int, url: str) -> list[str]:
    """Voices for ending a long (7+ day) reign. Favourite first."""
    return [
        f"Someone finally did it.\n\n{new} just ended {old}'s {days}-day reign at #1 "
        f"on {game}.\n\nNew leader. New score to chase.\n\n{url}",
        f"We have a new leader on {game}.\n\n{new} just ended {old}'s {days}-day run "
        f"at the top and took the #1 spot.\n\nThe new score to beat is {score:,}.\n\n"
        f"Who wants it next?\n\n{url}",
        f"{days} days at the top and it's finally over.\n\n{new} has knocked {old} off "
        f"#1 on {game} and taken the top spot.\n\nYour move, cave.\n\n{url}",
        f"The {game} leaderboard has a new name at the top.\n\nAfter a {days}-day reign, "
        f"{old} has been dethroned by {new}.\n\nNow we see how long the new champ can "
        f"hold it.\n\n{url}",
    ]


def _record_variants(new: str, old: str, game: str, days: int, url: str) -> list[str]:
    """Bigger voices for ending the longest reign on record. Favourite first."""
    return [
        f"It took {days} days, but somebody finally got them.\n\n{new} has ended {old}'s "
        f"record reign at the top of {game}.\n\nThe longest reign in Skycave history "
        f"ends here.\n\nA new one starts now.\n\n{url}",
        f"{days} days.\n\nThat's how long {old} sat at the top of {game}, the longest "
        f"anyone has ever held a Skycave leaderboard.\n\nToday, {new} ended the run.\n\n"
        f"We have a new #1.\n\n{url}",
        f"A Skycave record just fell.\n\nAfter {days} days at #1, {old}'s record-breaking "
        f"{game} reign has been ended by {new}.\n\n{days} days is going to take some "
        f"beating.\n\nAnd now {new} gets to start counting.\n\n{url}",
        f"The longest reign in Skycave history is over.\n\n{old} held #1 on {game} for "
        f"{days} days.\n\n{new} just took the top spot.\n\nRespect the run. Welcome the "
        f"new #1.\n\n{url}",
    ]


def _pick_variant(variants: list[str], seed: int) -> str:
    """Deterministically choose one variant that fits the length budget (so the
    same event always renders the same post, and no two nearby events collide on
    the same wording). Falls back to the shortest if none fit."""
    fits = [v for v in variants if len(v) <= _TAKEOVER_LIMIT]
    pool = fits or [min(variants, key=len)]
    return pool[seed % len(pool)]


def compose_takeover(
    *,
    game_type: str,
    new_handle: str,
    old_handle: str | None,
    old_display: str | None,
    days: int,
    new_score: int,
    is_record: bool,
    seed: int,
) -> str:
    game = _solo_name(_game_name(game_type))
    new = _at(new_handle)
    old = f"@{old_handle}" if old_handle else (old_display or "the previous #1")
    url = f"skycave.space/play/{_slug(game_type)}"
    variants = (
        _record_variants(new, old, game, days, url)
        if is_record
        else _reign_variants(new, old, game, days, new_score, url)
    )
    return _pick_variant(variants, seed)


def _record_set_variants(who: str, game: str, days: int, url: str) -> list[str]:
    """Voices for a reign BECOMING the longest in Skycave history - the champ is
    still on the throne, so this celebrates them, not a challenger."""
    return [
        f"{days} days at #1.\n\n{who} now holds the longest reign in Skycave history, "
        f"on {game}. Nobody has ever sat on top this long.\n\nStill counting. Who can "
        f"end it?\n\n{url}",
        f"A Skycave record.\n\n{who} has held #1 on {game} for {days} days, longer than "
        f"anyone ever has.\n\nThe throne is theirs, and the clock is still "
        f"running.\n\n{url}",
        f"History on {game}.\n\n{who}'s {days}-day reign at the top is now the longest "
        f"Skycave has ever seen.\n\nSomebody's going to have to end it.\n\n{url}",
        f"{days} days on top, and it's a record.\n\nNo one has ever held a Skycave #1 "
        f"longer than {who} on {game}.\n\nThe reign continues.\n\n{url}",
    ]


def compose_record_set(*, game_type: str, handle: str, days: int, seed: int) -> str:
    """The post for a still-running reign that just became the longest ever."""
    game = _solo_name(_game_name(game_type))
    url = f"skycave.space/play/{_slug(game_type)}"
    return _pick_variant(_record_set_variants(_at(handle), game, days, url), seed)


# --------------------------------------------------------------------------- #
# Gathering a day from the database
# --------------------------------------------------------------------------- #
# Kept below the pure composer so the composer stays import-light and testable.

from datetime import datetime  # noqa: E402
from sqlalchemy import select, func  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from app.models.game_session import GameSession  # noqa: E402


def _is_named(handle: str | None, pid: str | None) -> bool:
    # A handle that is itself a DID is an unresolved one; tagging it posts a raw
    # "@did:plc:..." (a real bug we shipped once), so it counts as not-named.
    return (
        bool(handle)
        and handle != "guest"
        and not handle.startswith("did:")
        and bool(pid)
        and pid.startswith("did:")
    )


async def collect_day(db: AsyncSession, start: datetime, end: datetime) -> DayData:
    """Gather one day's roundup material from game_sessions.

    Only a day's worth of rows (a few hundred at most), so the day is pulled
    once and reduced in Python; the two extra queries are the "first ever"
    look-backs that a single window can't answer.
    """
    G = GameSession
    rows = (
        await db.execute(select(G).where(G.created_at >= start, G.created_at < end))
    ).scalars().all()

    # Authoritative did -> handle from the users table. A session's stored handle
    # can be stale, or on older rows the raw DID; the users row carries the
    # current handle, so an @mention resolves and we never post "@did:plc:...".
    from app.models.user import User  # noqa: E402

    day_dids = {
        d
        for r in rows
        for d in (r.player1_id, r.player2_id)
        if d and d.startswith("did:")
    }
    authoritative: dict[str, str] = {}
    if day_dids:
        authoritative = dict(
            (await db.execute(select(User.did, User.handle).where(User.did.in_(day_dids)))).all()
        )

    def _h(pid: str | None, fallback: str | None) -> str | None:
        return (authoritative.get(pid) if pid else None) or fallback

    data = DayData(total_games=len(rows))
    handle_of: dict[str, str] = {}  # did -> handle, resolved
    best: dict[tuple[str, str], int] = {}  # (handle, game) -> best solo score
    win_dids: set[str] = set()
    played_dids: set[str] = set()

    for r in rows:
        h1 = _h(r.player1_id, r.player1_handle)
        h2 = _h(r.player2_id, r.player2_handle)
        if _is_named(h1, r.player1_id):
            data.named_players.add(h1)
            handle_of[r.player1_id] = h1
            played_dids.add(r.player1_id)
        if _is_named(h2, r.player2_id):
            data.named_players.add(h2)
            handle_of[r.player2_id] = h2
            played_dids.add(r.player2_id)

        # Best solo score per player+game.
        if r.mode == "solo" and _is_named(h1, r.player1_id) and r.player1_score > 0:
            key = (h1, r.game_type)
            if r.player1_score > best.get(key, 0):
                best[key] = r.player1_score

        # 1v1 wins (map the winning did to its resolved handle).
        if r.mode == "versus" and r.winner_id and r.winner_id.startswith("did:"):
            wh = h1 if r.winner_id == r.player1_id else h2
            if _is_named(wh, r.winner_id):
                win_dids.add(r.winner_id)
                data.versus_wins.append((wh, r.game_type))

    data.top_solo = sorted(
        (Highlight(h, g, s) for (h, g), s in best.items()),
        key=lambda x: x.score,
        reverse=True,
    )

    # Milestone: winners whose earliest-ever win is inside this window.
    if win_dids:
        first_win_at = dict(
            (
                await db.execute(
                    select(G.winner_id, func.min(G.created_at))
                    .where(G.winner_id.in_(win_dids))
                    .group_by(G.winner_id)
                )
            ).all()
        )
        data.first_wins = [
            handle_of[d] for d, t in first_win_at.items()
            if t >= start and d in handle_of
        ]

    # Newcomers: players whose earliest-ever game (either side) is in this window.
    if played_dids:
        earliest: dict[str, datetime] = {}
        for col in (G.player1_id, G.player2_id):
            for pid, t in (
                await db.execute(
                    select(col, func.min(G.created_at))
                    .where(col.in_(played_dids))
                    .group_by(col)
                )
            ).all():
                if pid and (pid not in earliest or t < earliest[pid]):
                    earliest[pid] = t
        data.newcomers = [
            handle_of[d] for d, t in earliest.items()
            if t >= start and d in handle_of
        ]

    return data
