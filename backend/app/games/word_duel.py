"""Word Duel — both players get the same 6 letters, longest valid word wins.

Simultaneous mode: each player submits their best word; the server validates it
(real word + only uses the dealt letters) and scores it by length. Both players
can score; the longer valid word takes the round. Skill-based, infinite letter
combinations. The dictionary (Scrabble word list) is bundled server-side; the
client never needs it.
"""
from __future__ import annotations

import random
from collections import Counter
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.games.base import SIMULTANEOUS, BaseGame

_DATA = Path(__file__).parent / "data" / "words.txt"
MIN_WORD_LEN = 3

# Scrabble-ish letter bag (rough frequency), weighted toward usable hands.
_LETTER_BAG = (
    "AAAAAAAAA" "BB" "CC" "DDDD" "EEEEEEEEEEEE" "FF" "GGG" "HH"
    "IIIIIIIII" "J" "K" "LLLL" "MM" "NNNNNN" "OOOOOOOO" "PP" "Q"
    "RRRRRR" "SSSS" "TTTTTT" "UUUU" "VV" "WW" "X" "YY" "Z"
)
_VOWELS = set("AEIOU")


@lru_cache
def _words() -> frozenset[str]:
    with _DATA.open(encoding="utf-8") as f:
        return frozenset(w.strip().upper() for w in f if w.strip())


def _deal_letters() -> list[str]:
    """Deal 6 letters with at least 2 vowels, retrying until satisfied."""
    for _ in range(50):
        hand = random.sample(_LETTER_BAG, 6)
        if sum(1 for c in hand if c in _VOWELS) >= 2:
            return hand
    return hand  # extremely unlikely fallback


def _is_valid(word: str, letters: list[str]) -> bool:
    word = word.upper()
    if len(word) < MIN_WORD_LEN:
        return False
    if not word.isalpha():
        return False
    # Must be formable from the dealt letters (respecting multiplicity).
    avail = Counter(letters)
    need = Counter(word)
    if any(need[c] > avail.get(c, 0) for c in need):
        return False
    return word in _words()


class WordDuel(BaseGame):
    type = "word_duel"
    name = "Word Duel"
    tagline = "Same 6 letters. Longest real word wins the round."
    total_rounds = 5
    round_time = 22.0
    result_delay = 4.5
    mode = SIMULTANEOUS

    def new_round(self, round_number: int) -> tuple[dict[str, Any], dict[str, Any]]:
        letters = _deal_letters()
        public = {"letters": letters, "round_time": self.round_time}
        secret = {"letters": letters}
        return public, secret

    def resolve(
        self,
        public: dict[str, Any],
        secret: dict[str, Any],
        actions: dict[str, dict[str, Any]],
    ) -> dict[str, int]:
        letters = secret["letters"]
        scores: dict[str, int] = {}
        for player_id, action in actions.items():
            word = str(action.get("word", "")).strip().upper()
            scores[player_id] = len(word) if _is_valid(word, letters) else 0
        return scores

    def reveal(self, public: dict[str, Any], secret: dict[str, Any]) -> dict[str, Any]:
        return {"letters": secret["letters"]}

    def result_details(
        self,
        public: dict[str, Any],
        secret: dict[str, Any],
        actions: dict[str, dict[str, Any]],
        points: dict[str, int],
    ) -> dict[str, Any]:
        letters = secret["letters"]
        words: dict[str, Any] = {}
        for player_id, action in actions.items():
            word = str(action.get("word", "")).strip().upper()
            words[player_id] = {
                "word": word,
                "valid": _is_valid(word, letters),
                "length": len(word),
            }
        return {"words": words}
