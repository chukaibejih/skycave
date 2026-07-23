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
        return f"{who} shaped a {h.score} on Clay \U0001f3fa"  # 🏺
    if h.game_type == "uno":
        return f"{who} ran the Uno table"
    if h.game_type == "tile_takeover":
        return f"{who} flooded the board in Tile Takeover"
    return f"{who} topped {name} with {h.score:,}"


def _versus_line(handle: str, game_types: list[str]) -> str:
    who = _at(handle)
    names = [_game_name(g) for g in game_types]
    if len(names) == 1:
        return f"{who} took {names[0]}"
    if len(names) == 2:
        return f"{who} took {names[0]} and {names[1]}"
    return f"{who} took {names[0]}, {names[1]} and more"


def compose_roundup(data: DayData, day_label: str) -> str | None:
    """The day's post, or None to stay silent.

    day_label is a short human date like "Jul 22" used only on the quiet-day form.
    """
    # Guardrail 1: skip quiet days.
    if data.total_games < QUIET_MIN_GAMES or len(data.named_players) < QUIET_MIN_PLAYERS:
        return None

    busy = data.total_games >= BUSY_MIN_GAMES and len(data.named_players) >= BUSY_MIN_PLAYERS

    # The lead, by spotlight priority: a first-win milestone, else a brand-new
    # player, else the day's standout score. This is what stops the top scorer
    # from leading every single day.
    lead: str | None = None
    featured: str | None = None
    if data.first_wins:
        h = data.first_wins[0]
        lead = f"\U0001f389 {_at(h)} just won their first Skycave game. Welcome in."
        featured = h
    elif data.newcomers:
        h = data.newcomers[0]
        lead = f"\U0001f44b {_at(h)} jumped into Skycave for the first time yesterday."
        featured = h

    star = data.top_solo[0] if data.top_solo else None

    # --- Quiet day: one highlight + a challenge (Option B) ---
    if not busy:
        if lead:
            body = lead
            if star and star.handle != featured:
                body += f"\n\nAlso yesterday: {_score_line(star)}."
            tail = "\n\nCome play: skycave.space"
        elif star:
            body = f"Yesterday's top score: {_score_line(star)}"
            tail = f"\n\nThink you can beat it? skycave.space/play/{_slug(star.game_type)}"
        else:
            return None
        return _fit(body + tail)

    # --- Busy day: a short recap (Option A) ---
    lines: list[str] = ["Yesterday in the cave \U0001f3ae"]  # 🎮
    body_lines: list[str] = []
    used: set[str] = set()

    if lead:
        body_lines.append(lead)
        used.add(featured or "")

    # The standout score, if its player isn't already the lead.
    if star and star.handle not in used:
        body_lines.append(f"{_score_line(star)}.")
        used.add(star.handle)

    # Spotlight spread: pull in a *different* winner than everyone so far.
    other = _second_voice(data, used)
    if other:
        body_lines.append(f"{other}.")

    if not body_lines:
        return None

    post = lines[0] + "\n\n" + "\n".join(body_lines) + "\n\nYour move: skycave.space"
    return _fit(post)


def _second_voice(data: DayData, used: set[str]) -> str | None:
    """A recap line for a player not yet featured, preferring a lighter name so
    the spotlight spreads beyond the day's heaviest player."""
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
                return _score_line(h)
        return None
    # Prefer the handle with the FEWEST wins (the lighter player), to spread it.
    handle = min(by_handle, key=lambda h: len(by_handle[h]))
    return _versus_line(handle, by_handle[handle])


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
# Gathering a day from the database
# --------------------------------------------------------------------------- #
# Kept below the pure composer so the composer stays import-light and testable.

from datetime import datetime  # noqa: E402
from sqlalchemy import select, func  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from app.models.game_session import GameSession  # noqa: E402


def _is_named(handle: str | None, pid: str | None) -> bool:
    return bool(handle) and handle != "guest" and bool(pid) and pid.startswith("did:")


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

    data = DayData(total_games=len(rows))
    handle_of: dict[str, str] = {}  # did -> handle, from this day's rows
    best: dict[tuple[str, str], int] = {}  # (handle, game) -> best solo score
    win_dids: set[str] = set()
    played_dids: set[str] = set()

    for r in rows:
        if _is_named(r.player1_handle, r.player1_id):
            data.named_players.add(r.player1_handle)
            handle_of[r.player1_id] = r.player1_handle
            played_dids.add(r.player1_id)
        if _is_named(r.player2_handle, r.player2_id):
            data.named_players.add(r.player2_handle)
            handle_of[r.player2_id] = r.player2_handle
            played_dids.add(r.player2_id)

        # Best solo score per player+game.
        if r.mode == "solo" and _is_named(r.player1_handle, r.player1_id) and r.player1_score > 0:
            key = (r.player1_handle, r.game_type)
            if r.player1_score > best.get(key, 0):
                best[key] = r.player1_score

        # 1v1 wins (map the winning did to its handle on this row).
        if r.mode == "versus" and r.winner_id and r.winner_id.startswith("did:"):
            win_dids.add(r.winner_id)
            wh = r.player1_handle if r.winner_id == r.player1_id else r.player2_handle
            if wh and wh != "guest":
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
