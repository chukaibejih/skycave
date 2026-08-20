"""Word Hunt - trace words through a 4x4 letter grid.

A word only counts if it's a real word AND can be traced through adjacent cells
(8 directions, each cell used once) - that spatial constraint is what sets it
apart from Word Duel's loose anagram. The client enforces adjacency while you
drag; the server re-validates the traced path independently (never trust the
client). Solo: find as many as you can in the time limit, points accumulate.
1v1: head-to-head - both players work the SAME grid for the whole round, every
valid word accumulates, and the higher TOTAL across the grids takes the match
(the engine sums each round's score). Boards are pre-checked for richness so no
round lands on a dud.
"""
from __future__ import annotations

import random
from bisect import bisect_left
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.games.base import SIMULTANEOUS, BaseGame

_DATA = Path(__file__).parent / "data" / "words.txt"
GRID_N = 4  # 4x4 board
MIN_WORD_LEN = 3

# Classic 16 Boggle dice - rolling one face each gives playable boards far more
# reliably than sampling a letter bag. Q is treated as a plain letter here.
BOGGLE_DICE = [
    "AAEEGN", "ABBJOO", "ACHOPS", "AFFKPS", "AOOTTW", "CIMOTU", "DEILRX",
    "DELRVY", "DISTTY", "EEGHNW", "EEINSU", "EHRTVW", "EITSSS", "ELRTTY",
    "HIMNQU", "HLNNRZ",
]


@lru_cache
def _words() -> frozenset[str]:
    with _DATA.open(encoding="utf-8") as f:
        return frozenset(w.strip().upper() for w in f if w.strip())


def _deal_grid() -> list[str]:
    """Roll each Boggle die and shuffle them into 16 grid positions."""
    faces = [random.choice(die) for die in BOGGLE_DICE]
    random.shuffle(faces)
    return faces


def _neighbors(idx: int) -> list[int]:
    r, c = divmod(idx, GRID_N)
    out = []
    for dr in (-1, 0, 1):
        for dc in (-1, 0, 1):
            if dr == 0 and dc == 0:
                continue
            nr, nc = r + dr, c + dc
            if 0 <= nr < GRID_N and 0 <= nc < GRID_N:
                out.append(nr * GRID_N + nc)
    return out


def _traceable(grid: list[str], word: str) -> bool:
    """True if `word` can be spelled along an adjacent, no-cell-reused path."""
    def dfs(idx: int, pos: int, used: frozenset[int]) -> bool:
        if pos == len(word):
            return True
        for n in _neighbors(idx):
            if n not in used and grid[n] == word[pos]:
                if dfs(n, pos + 1, used | {n}):
                    return True
        return False

    return any(
        grid[i] == word[0] and dfs(i, 1, frozenset({i}))
        for i in range(len(grid))
    )


def _is_valid(grid: list[str], word: str) -> bool:
    word = word.upper()
    if len(word) < MIN_WORD_LEN or not word.isalpha():
        return False
    if word not in _words():
        return False
    return _traceable(grid, word)


def _points(length: int) -> int:
    """Boggle-style scoring - longer words are worth disproportionately more."""
    if length <= 4:
        return 1
    if length == 5:
        return 2
    if length == 6:
        return 3
    if length == 7:
        return 5
    return 11  # 8+


# --- board richness: guarantee every board can make plenty of words -----------
MIN_BOARD_WORDS = 18  # reroll a board until it can trace at least this many words


@lru_cache
def _sorted_words() -> tuple[str, ...]:
    return tuple(sorted(_words()))


def _has_prefix(sw: tuple[str, ...], p: str) -> bool:
    """Does any dictionary word start with `p`? Binary search, so the DFS below
    prunes dead paths without holding a separate prefix set in memory."""
    i = bisect_left(sw, p)
    return i < len(sw) and sw[i].startswith(p)


def _count_words(grid: list[str], cap: int) -> int:
    """How many distinct dictionary words the grid can trace, counting up to `cap`
    then stopping early. Prefix-pruned DFS keeps even a sparse board fast."""
    sw = _sorted_words()
    words = _words()
    found: set[str] = set()

    def dfs(idx: int, used: frozenset[int], s: str) -> None:
        if len(found) >= cap:
            return
        if len(s) >= MIN_WORD_LEN and s in words:
            found.add(s)
        for n in _neighbors(idx):
            if n in used:
                continue
            ns = s + grid[n]
            if _has_prefix(sw, ns):
                dfs(n, used | {n}, ns)

    for i in range(len(grid)):
        if len(found) >= cap:
            break
        if _has_prefix(sw, grid[i]):
            dfs(i, frozenset({i}), grid[i])
    return len(found)


def _rich_grid() -> list[str]:
    """A board that can make at least MIN_BOARD_WORDS words, so no round is a dud.
    Bounded reroll: after a few tries it takes what it has (still playable) rather
    than looping forever."""
    grid = _deal_grid()
    for _ in range(15):
        if _count_words(grid, MIN_BOARD_WORDS) >= MIN_BOARD_WORDS:
            return grid
        grid = _deal_grid()
    return grid


class WordHunt(BaseGame):
    type = "word_hunt"
    name = "Word Hunt"
    tagline = "Trace words in the grid. Biggest haul wins."
    category = "words"
    total_rounds = 3
    round_time = 30.0
    result_delay = 4.5
    mode = SIMULTANEOUS
    versus_accumulate = True  # 1v1 is a head-to-head hunt: every word counts, total wins
    solo_kind = "words"  # one grid, find as many as you can; score accumulates
    solo_duration = 80.0

    def solo_word(self, letters: list[str], word: str) -> int:
        word = str(word).strip().upper()
        return _points(len(word)) if _is_valid(letters, word) else 0

    def solo_metric(self, score: int, game_state: dict[str, Any]) -> str:
        words = len((game_state.get("solo_state") or {}).get("used", []))
        return f"{score} pts · {words} words"

    def new_round(self, round_number: int) -> tuple[dict[str, Any], dict[str, Any]]:
        grid = _rich_grid()  # guaranteed to make plenty of words
        public = {"grid": grid, "cols": GRID_N, "round_time": self.round_time}
        # "letters" feeds the word-accumulation state (solo + 1v1; see game_engine).
        secret = {"grid": grid, "letters": grid}
        return public, secret

    def resolve(
        self,
        public: dict[str, Any],
        secret: dict[str, Any],
        actions: dict[str, dict[str, Any]],
    ) -> dict[str, int]:
        """Head-to-head: each player's round score is the sum over every valid word
        they traced (deduped as they went). The engine adds these across the grids,
        so the match goes to the higher TOTAL, not a single best word."""
        grid = secret["grid"]
        scores: dict[str, int] = {}
        for player_id, action in actions.items():
            words = action.get("words") or []
            scores[player_id] = sum(_points(len(w)) for w in words if _is_valid(grid, w))
        return scores

    def reveal(self, public: dict[str, Any], secret: dict[str, Any]) -> dict[str, Any]:
        return {"grid": secret["grid"]}

    def result_details(
        self,
        public: dict[str, Any],
        secret: dict[str, Any],
        actions: dict[str, dict[str, Any]],
        points: dict[str, int],
    ) -> dict[str, Any]:
        grid = secret["grid"]
        hunt: dict[str, Any] = {}
        for player_id, action in actions.items():
            valid = [w for w in (action.get("words") or []) if _is_valid(grid, w)]
            valid.sort(key=len, reverse=True)
            hunt[player_id] = {
                "words": valid[:10],       # the longest ten, for the reveal
                "count": len(valid),
                "points": points.get(player_id, 0),
            }
        return {"hunt": hunt}
