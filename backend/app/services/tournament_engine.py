"""The tournament engine: schedule, draw, series resolution, advancement.

Deliberately pure. Nothing here touches a database or the clock, so a whole
tournament can be simulated end to end in a test before any UI or endpoint
exists. The DB layer (services/tournament.py) is a thin shell over this.

Rules implemented, from `weekend_tournament_plan.md`:

  - bracket size is the next power of two; the shortfall becomes byes
  - the draw is random, and so are the byes: a bye is luck, not a reward
  - a fixture is best-of-3, each game drawn from the pool up front
  - a drawn game is replayed, capped, then the series falls back to points
  - 2-0 skips the third game
  - hosting alternates game to game, so no one holds the host seat all series
  - round deadlines are computed backwards from the Sunday wall and never move
    earlier; an early finish lengthens the next round instead
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from datetime import datetime, time, timedelta, timezone

# The pool for tournament fixtures. GeoGuess, Flag Rush and Outline Quiz are out
# for the first event; Reaction Grid and Mad Math are out until they have been
# played head to head at all (they have zero 1v1 games ever).
GAME_POOL = (
    "tile_takeover",
    "connect4",
    "word_hunt",
    "color_clash",
    "mancala",
    "clay",
    "dots_boxes",
    "uno",
)

SERIES_LENGTH = 3
WINS_NEEDED = 2
# A drawn game is replayed, but not forever. After this many replays the series
# falls back to total points, so a fixture can never stall the bracket.
MAX_REPLAYS = 2

# The fairness floor: below roughly 12h a round window lands entirely inside
# somebody's night. At a 72h weekend that caps the field at 2**6.
MAX_ROUNDS = 6
MAX_FIELD = 2**MAX_ROUNDS


def bracket_size_for(field: int) -> int:
    """Next power of two at or above the field (minimum of 2)."""
    if field < 2:
        return 2
    return 1 << (field - 1).bit_length()


def main_size_for(field: int) -> int:
    """The main-draw size: the largest power of two at or *below* the field
    (minimum 2). Everyone above this plays a play-in for the last seats, instead
    of the old approach of padding *up* to the next power of two with byes."""
    if field < 2:
        return 2
    return 1 << (field.bit_length() - 1)


def overflow_for(field: int) -> int:
    """Players above the main-draw size. Equals the number of play-in matches,
    and the number of contested main-draw seats those matches feed. Zero when the
    field is exactly a power of two (then there is no play-in at all)."""
    return max(0, field - main_size_for(field))


def rounds_for(field: int) -> int:
    """The number of scheduling windows. Unchanged from the bye era on purpose:
    a play-in simply takes over what used to be the near-empty first round, so
    log2(main) main rounds plus one play-in window equals log2(next power of two),
    which is exactly what a power-of-two field needs with no play-in."""
    return max(1, int(math.log2(bracket_size_for(field))))


def round_deadlines(
    play_opens_at: datetime, play_closes_at: datetime, rounds: int
) -> list[datetime]:
    """Split the play window into `rounds` equal slices, ending on the wall.

    Computed forwards from the open but anchored so the final round's deadline
    is exactly play_closes_at, which is what guarantees the tournament cannot
    run past Sunday night.
    """
    if rounds < 1:
        return []
    total = play_closes_at - play_opens_at
    step = total / rounds
    return [play_opens_at + step * (i + 1) for i in range(rounds)]


def draw_series(rng: random.Random, pool: tuple[str, ...] = GAME_POOL) -> list[str]:
    """Three distinct games for one fixture.

    Without replacement, so a series never repeats a game: three different
    games is a better test of range, and a repeat would look like a bug.
    """
    return rng.sample(list(pool), k=min(SERIES_LENGTH, len(pool)))


def host_for_game(match_player1: str, match_player2: str | None, game_index: int) -> str:
    """Who hosts game N of a series (0-based).

    Alternates, because the host still arrives with a warmer client than the
    joiner even after the broadcast-ordering fix. Over a series that evens out.
    """
    if match_player2 is None:
        return match_player1
    return match_player1 if game_index % 2 == 0 else match_player2


@dataclass
class Fixture:
    """One bracket slot. `p1`/`p2` are DIDs; a None p2 is a bye."""

    round: int
    slot: int
    p1: str | None = None
    p2: str | None = None
    games: list[str] = field(default_factory=list)
    # [{"game_type", "winner", "p1_score", "p2_score", "replays"}]
    results: list[dict] = field(default_factory=list)
    winner: str | None = None

    @property
    def is_bye(self) -> bool:
        """Byes are gone. The field is drawn *down* to a power of two with a
        play-in for the overflow, so no fixture is ever a free pass. A round-1
        seat left empty is a *contested* seat awaiting its play-in winner, which
        is M_PENDING, not a bye. Kept as an always-false shim so any remaining
        caller reads correctly; remove once every reference is gone."""
        return False

    def wins(self) -> tuple[int, int]:
        w1 = sum(1 for r in self.results if r.get("winner") == self.p1)
        w2 = sum(1 for r in self.results if r.get("winner") == self.p2)
        return w1, w2

    def points(self) -> tuple[int, int]:
        return (
            sum(int(r.get("p1_score") or 0) for r in self.results),
            sum(int(r.get("p2_score") or 0) for r in self.results),
        )

    def decided(self) -> bool:
        return self.winner is not None

    def games_needed(self) -> int:
        """How many games this series will actually take (2 on a sweep)."""
        w1, w2 = self.wins()
        return SERIES_LENGTH if max(w1, w2) < WINS_NEEDED else len(self.results)


def build_bracket(entrant_dids: list[str], rng: random.Random) -> list[Fixture]:
    """Draw the whole bracket at once: the play-in, the main draw, and every
    fixture's games, all published from the moment registration closes.

    `entrant_dids` MUST arrive in registration order (earliest first). The last
    ``2 * overflow`` registrants play the play-in (round 0) for the contested
    seats; everyone else is a direct entrant. Only that split is by registration
    - the pairings within each group are random, so the draw stays impartial.

    A play-in match at (round 0, slot j) feeds a main-draw seat by the ordinary
    advance rule (slot j -> round-1 slot j//2, the p1 seat when j is even). So the
    winners fill the first ``overflow`` main-draw seats and no special wiring is
    needed. A field that is exactly a power of two has no overflow and no play-in.
    """
    field = len(entrant_dids)
    if field < 2:
        raise ValueError("a tournament needs at least 2 entrants")
    if field > MAX_FIELD:
        raise ValueError(f"field {field} exceeds the {MAX_FIELD} fairness ceiling")

    main = main_size_for(field)
    overflow = overflow_for(field)
    main_matches = main // 2
    main_rounds = max(1, int(math.log2(main)))

    # The split is by registration; the pairing inside each group is random.
    direct = list(entrant_dids[: field - 2 * overflow])
    playin = list(entrant_dids[field - 2 * overflow :])
    rng.shuffle(direct)
    rng.shuffle(playin)

    fixtures: list[Fixture] = []

    # Play-in (round 0): one match per contested seat.
    for j in range(overflow):
        fixtures.append(
            Fixture(round=0, slot=j, p1=playin[2 * j], p2=playin[2 * j + 1], games=draw_series(rng))
        )

    # Main-draw round 1. Seat index i maps to (slot i//2, p1 if i even else p2).
    # The first `overflow` seats are contested (left empty for a play-in winner);
    # the rest take the direct entrants in order.
    seats: list[str | None] = [None] * overflow + direct  # length == main
    for slot in range(main_matches):
        fixtures.append(
            Fixture(
                round=1,
                slot=slot,
                p1=seats[2 * slot],
                p2=seats[2 * slot + 1],
                games=draw_series(rng),
            )
        )

    # Empty shells for every later main round, with their games already drawn.
    for rnd in range(2, main_rounds + 1):
        for slot in range(main >> rnd):
            fixtures.append(Fixture(round=rnd, slot=slot, games=draw_series(rng)))

    return fixtures


def record_game(
    fx: Fixture, winner: str | None, p1_score: int = 0, p2_score: int = 0
) -> None:
    """Record one played game, replaying a draw up to the cap.

    A drawn game is not stored as a decided result; it re-runs the same game.
    Past the cap the draw is stored anyway, and series resolution falls through
    to total points, so the bracket can always move on.
    """
    if fx.decided():
        return
    idx = len(fx.results)
    if winner is None:
        # Count replays of the game currently in play.
        replays = sum(
            1 for r in fx.results if r.get("game_type") == _current_game(fx) and r.get("winner") is None
        )
        if replays < MAX_REPLAYS:
            fx.results.append(
                {
                    "game_type": _current_game(fx),
                    "winner": None,
                    "p1_score": p1_score,
                    "p2_score": p2_score,
                    "replays": replays + 1,
                    "replay": True,
                }
            )
            return
    fx.results.append(
        {
            "game_type": _current_game(fx),
            "winner": winner,
            "p1_score": p1_score,
            "p2_score": p2_score,
            "replay": False,
        }
    )
    _resolve(fx)
    _ = idx


def _current_game(fx: Fixture) -> str:
    """The game being played now: replays do not advance the series."""
    decided = sum(1 for r in fx.results if not r.get("replay"))
    return fx.games[min(decided, len(fx.games) - 1)]


def _resolve(fx: Fixture) -> None:
    """Decide the series if it is decidable."""
    w1, w2 = fx.wins()
    if w1 >= WINS_NEEDED:
        fx.winner = fx.p1
        return
    if w2 >= WINS_NEEDED:
        fx.winner = fx.p2
        return
    played = sum(1 for r in fx.results if not r.get("replay"))
    if played >= SERIES_LENGTH:
        # All three played without anyone reaching two wins: only reachable via
        # a capped draw. Fall back to points, then to the host as last resort so
        # the bracket can never deadlock.
        if w1 != w2:
            fx.winner = fx.p1 if w1 > w2 else fx.p2
            return
        s1, s2 = fx.points()
        fx.winner = fx.p1 if s1 >= s2 else fx.p2


def advance(fixtures: list[Fixture]) -> bool:
    """Push decided winners into their next-round slots.

    Returns True if anything moved. Slot s of round r feeds slot s//2 of round
    r+1, taking the p1 seat on an even slot and p2 on an odd one.
    """
    by_key = {(f.round, f.slot): f for f in fixtures}
    moved = False
    for fx in fixtures:
        if not fx.decided():
            continue
        nxt = by_key.get((fx.round + 1, fx.slot // 2))
        if nxt is None:
            continue
        seat = "p1" if fx.slot % 2 == 0 else "p2"
        if getattr(nxt, seat) != fx.winner:
            setattr(nxt, seat, fx.winner)
            moved = True
    return moved


def playable(fixtures: list[Fixture]) -> list[Fixture]:
    """Fixtures with both players known and no winner yet."""
    return [f for f in fixtures if not f.decided() and f.p1 and f.p2]


def champion(fixtures: list[Fixture]) -> str | None:
    if not fixtures:
        return None
    last = max(f.round for f in fixtures)
    final = [f for f in fixtures if f.round == last]
    return final[0].winner if len(final) == 1 else None


# --------------------------------------------------------------------------- #
# Weekend anchors
# --------------------------------------------------------------------------- #

from zoneinfo import ZoneInfo  # noqa: E402

# Registration closes (and fixtures reveal) Thursday morning Pacific. Stored and
# compared in UTC, but computed in the wall-clock zone so the hour a player sees
# is the same in July and December. Pacific shifts by an hour across DST, so
# deriving this from a fixed UTC offset would silently drift.
PACIFIC = ZoneInfo("America/Los_Angeles")
CLOSE_WEEKDAY = 3     # Monday=0, so Thursday
CLOSE_HOUR = 12       # registration closes 12:00 Pacific (noon), Thursday
PLAY_OPEN_HOUR = 14   # earliest a round can open: 14:00 Pacific (the Thursday slot)
PLAY_CLOSE_HOUR = 19  # hard wall (final closes) 19:00 Pacific = 10pm Eastern, Sunday


def weekend_anchors(now: datetime) -> tuple[datetime, datetime, datetime]:
    """(registration_closes, play_opens, play_closes) for the coming weekend.

    Every anchor is a wall-clock Pacific time, converted to UTC, so the schedule
    holds its local hour across DST rather than drifting like a fixed UTC offset:

      registration closes  Thursday 12:00 Pacific (noon)
      play opens           Thursday 14:00 Pacific (the earliest a round can open)
      hard wall (final)     Sunday  19:00 Pacific (= 10pm Eastern)

    These three only frame the week. The per-round windows come from
    ``round_windows``, which drops each round into a named daily slot so no match
    is ever pulled into someone's night; ``play_opens`` here is the earliest that
    slot grid can start (the Thursday evening slot a full 64 field uses), and the
    draw resets ``play_opens_at`` to the field's actual first round.
    """
    local = now.astimezone(PACIFIC)
    # The next Thursday 12:00 Pacific strictly after `now`.
    ahead = (CLOSE_WEEKDAY - local.weekday()) % 7
    close_local = (local + timedelta(days=ahead)).replace(
        hour=CLOSE_HOUR, minute=0, second=0, microsecond=0
    )
    if close_local <= local:
        close_local += timedelta(days=7)
    closes = close_local.astimezone(timezone.utc)

    # Play opens the same Thursday at 14:00 Pacific; the wall is the following
    # Sunday (Thursday + 3 days) at 19:00 Pacific. Both are built in Pacific and
    # then converted, so DST is handled for free.
    open_local = close_local.replace(hour=PLAY_OPEN_HOUR, minute=0, second=0, microsecond=0)
    close_play_local = (open_local + timedelta(days=3)).replace(
        hour=PLAY_CLOSE_HOUR, minute=0, second=0, microsecond=0
    )
    opens = open_local.astimezone(timezone.utc)
    play_closes = close_play_local.astimezone(timezone.utc)
    return closes, opens, play_closes


# --------------------------------------------------------------------------- #
# Per-round day-slot schedule (v5)
# --------------------------------------------------------------------------- #
#
# Rounds no longer slice the play window evenly; each one lands in a named daily
# slot, so a round never opens in the middle of somebody's night and a match
# never goes live while a player is asleep. Two slot shapes, both Pacific wall
# clock:
#
#   EVENING  14:00-19:00 PT  (5pm-10pm ET)   the night's decisive round
#   MORNING  08:00-13:00 PT  (11am-4pm ET)   a weekend day's earlier round
#
# 08:00 PT is the earliest anything opens; every evening closes at 19:00 PT,
# which is 10pm Eastern, the latest timezone, so that wall is a reasonable hour
# for everyone in the US. On a two-round day the morning round hands to the
# evening round with a one-hour buffer (13:00 -> 14:00). The final is always the
# Sunday evening slot; smaller fields use fewer days, spreading Friday to Sunday,
# and only a full 33-64 field (six rounds) reaches back to the Thursday slot.
# The earliest a round may open in the day, Pacific. A raw open before this (the
# dead of night) is pushed here so nobody is asked to start a match at 4am.
MORNING_OPEN_HOUR = 8
# Target width per round. The play window is sized to `rounds * this`, so a small
# field gets fewer, wider windows instead of tight fixed slots; 13h averages a
# roomy daytime block and a roomy overnight block across a weekend.
WINDOW_HOURS_PER_ROUND = 13


def _snap_open(dt_pac: datetime) -> datetime:
    """Nudge a raw open out of the dead of night into the morning, else round it
    down to a clean hour - so every round opens at a civilised, tidy time."""
    if dt_pac.hour < MORNING_OPEN_HOUR:
        return dt_pac.replace(hour=MORNING_OPEN_HOUR, minute=0, second=0, microsecond=0)
    return dt_pac.replace(minute=0, second=0, microsecond=0)


def round_windows(play_opens_at: datetime, rounds: int) -> list[tuple[datetime, datetime]]:
    """(open, close) in UTC for each round, earliest first - wide, contiguous
    windows spread across the weekend and scaled to the field.

    The play window runs from a start sized to the field (fewer rounds -> a later
    start, but never before Thursday 2pm Pacific) to the Sunday 7pm wall, and is
    split into `rounds` equal slices end to end, so there is no dead time between
    rounds and each one gets a generous window. Each open is nudged out of the
    dead of night; the final always closes on the Sunday wall. Built in Pacific
    wall clock and converted to UTC, so a window holds its local hour across DST.

    ``play_opens_at`` supplies only the calendar week, snapped back to its
    Thursday, so this stays correct even after the draw resets ``play_opens_at``
    to the field's actual first round.
    """
    if rounds < 1:
        return []

    d = play_opens_at.astimezone(PACIFIC).date()
    thursday = d - timedelta(days=(d.weekday() - CLOSE_WEEKDAY) % 7)
    sunday = thursday + timedelta(days=3)
    wall = datetime.combine(sunday, time(PLAY_CLOSE_HOUR), tzinfo=PACIFIC)
    earliest = datetime.combine(thursday, time(PLAY_OPEN_HOUR), tzinfo=PACIFIC)
    start = max(earliest, wall - timedelta(hours=WINDOW_HOURS_PER_ROUND * rounds))
    span = wall - start

    # First the opens: an even spread, each nudged to a civilised hour and kept
    # strictly increasing. Then contiguous windows - each round runs until an hour
    # before the next one opens (a settle buffer), and the final closes on the wall.
    opens: list[datetime] = []
    prev: datetime | None = None
    for i in range(rounds):
        o = _snap_open((start + span * i / rounds).astimezone(PACIFIC))
        if prev is not None and o <= prev:
            o = prev + timedelta(hours=1)
        opens.append(o)
        prev = o

    windows: list[tuple[datetime, datetime]] = []
    for i in range(rounds):
        o = opens[i]
        if i == rounds - 1:
            c = wall
        else:
            c = opens[i + 1] - timedelta(hours=1)
            if c <= o:
                c = opens[i + 1]
        windows.append((o.astimezone(timezone.utc), c.astimezone(timezone.utc)))
    return windows
