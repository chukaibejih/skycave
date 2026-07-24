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
from datetime import datetime, timedelta

# The pool for tournament fixtures. GeoGuess, Flag Rush and Outline Quiz are out
# for the first event; Reaction Grid and Mad Math are out until they have been
# played head to head at all (they have zero 1v1 games ever).
GAME_POOL = (
    "tile_takeover",
    "connect4",
    "word_hunt",
    "color_clash",
    "word_duel",
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


def rounds_for(field: int) -> int:
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
        return (self.p1 is None) != (self.p2 is None)

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
    """Draw the whole bracket at once: pairings, byes, and every fixture's games.

    Every round is created up front, not just round one, so the entire set of
    games is published from the moment registration closes. Later rounds start
    with empty player slots that advancement fills in.
    """
    field = len(entrant_dids)
    if field < 2:
        raise ValueError("a tournament needs at least 2 entrants")
    if field > MAX_FIELD:
        raise ValueError(f"field {field} exceeds the {MAX_FIELD} fairness ceiling")

    size = bracket_size_for(field)
    rounds = rounds_for(field)

    players = list(entrant_dids)
    rng.shuffle(players)  # the draw itself

    # Spread the byes across the round-one matches rather than clustering them
    # at one end, so the published bracket looks impartial as well as being it.
    num_matches = size // 2
    byes = size - field
    bye_slots: set[int] = set()
    if byes:
        stride = num_matches / byes
        bye_slots = {int(i * stride) for i in range(byes)}
        # Rounding can collide; fill any shortfall with the next free slot.
        i = 0
        while len(bye_slots) < byes and i < num_matches:
            bye_slots.add(i)
            i += 1

    fixtures: list[Fixture] = []
    cursor = 0
    for slot in range(num_matches):
        if slot in bye_slots:
            p1, p2 = players[cursor], None
            cursor += 1
        else:
            p1, p2 = players[cursor], players[cursor + 1]
            cursor += 2
        fixtures.append(
            Fixture(round=1, slot=slot, p1=p1, p2=p2, games=draw_series(rng))
        )

    # Empty shells for every later round, with their games already drawn.
    for rnd in range(2, rounds + 1):
        for slot in range(size >> rnd):
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


def apply_byes(fixtures: list[Fixture]) -> None:
    """A bye advances immediately, with no games played."""
    for fx in fixtures:
        if fx.round == 1 and fx.is_bye and not fx.decided():
            fx.winner = fx.p1 if fx.p2 is None else fx.p2


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
