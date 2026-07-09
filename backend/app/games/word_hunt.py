"""Word Hunt — trace words through a 4x4 letter grid.

A word only counts if it's a real word AND can be traced through adjacent cells
(8 directions, each cell used once) — that spatial constraint is what sets it
apart from Word Duel's loose anagram. The client enforces adjacency while you
drag; the server re-validates the traced path independently (never trust the
client). Solo: find as many as you can in the time limit, points accumulate.
1v1: same grid, each player's best word is scored, higher points wins the round.
"""
from __future__ import annotations

import random
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.games.base import SIMULTANEOUS, BaseGame

_DATA = Path(__file__).parent / "data" / "words.txt"
GRID_N = 4  # 4x4 board
MIN_WORD_LEN = 3

# Classic 16 Boggle dice — rolling one face each gives playable boards far more
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
    """Boggle-style scoring — longer words are worth disproportionately more."""
    if length <= 4:
        return 1
    if length == 5:
        return 2
    if length == 6:
        return 3
    if length == 7:
        return 5
    return 11  # 8+


class WordHunt(BaseGame):
    type = "word_hunt"
    name = "Word Hunt"
    tagline = "Trace words in the grid. Longest hunt wins."
    total_rounds = 3
    round_time = 30.0
    result_delay = 4.5
    mode = SIMULTANEOUS
    solo_kind = "words"  # one grid, find as many as you can; score accumulates
    solo_duration = 80.0

    def solo_word(self, letters: list[str], word: str) -> int:
        word = str(word).strip().upper()
        return _points(len(word)) if _is_valid(letters, word) else 0

    def solo_metric(self, score: int, game_state: dict[str, Any]) -> str:
        words = len((game_state.get("solo_state") or {}).get("used", []))
        return f"{score} pts · {words} words"

    def new_round(self, round_number: int) -> tuple[dict[str, Any], dict[str, Any]]:
        grid = _deal_grid()
        public = {"grid": grid, "cols": GRID_N, "round_time": self.round_time}
        # "letters" feeds the solo word-accumulation state (see game_engine).
        secret = {"grid": grid, "letters": grid}
        return public, secret

    def resolve(
        self,
        public: dict[str, Any],
        secret: dict[str, Any],
        actions: dict[str, dict[str, Any]],
    ) -> dict[str, int]:
        grid = secret["grid"]
        scores: dict[str, int] = {}
        for player_id, action in actions.items():
            word = str(action.get("word", "")).strip().upper()
            scores[player_id] = _points(len(word)) if _is_valid(grid, word) else 0
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
        words: dict[str, Any] = {}
        for player_id, action in actions.items():
            word = str(action.get("word", "")).strip().upper()
            valid = _is_valid(grid, word)
            words[player_id] = {
                "word": word,
                "valid": valid,
                "points": _points(len(word)) if valid else 0,
            }
        return {"words": words}
