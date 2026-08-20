"""Word Duel - both players get the same 6 letters; make as many words as you can.

1v1 is a head-to-head hunt: both players get the identical 6 letters and, for the
whole round, submit every word they can make (real word + only the dealt letters,
respecting multiplicity), each scored by length. Points accumulate, and the higher
TOTAL across the rounds takes the match (the engine sums each round). Solo is the
same, solo. The dictionary (Scrabble word list) is bundled server-side; the client
never needs it. Letter sets are pre-checked so a round is never word-poor.
"""
from __future__ import annotations

import random
from collections import Counter
from functools import lru_cache
from itertools import permutations
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


# --- letter-set richness: never deal a word-poor hand ------------------------
MIN_DUEL_WORDS = 8  # reroll the hand until it can make at least this many words


def _formable_count(letters: list[str], cap: int) -> int:
    """How many distinct dictionary words the 6 letters can spell, up to `cap`.
    Cheap: at most a couple thousand permutations of the hand's subsets."""
    words = _words()
    found: set[str] = set()
    for k in range(MIN_WORD_LEN, len(letters) + 1):
        for perm in permutations(letters, k):
            w = "".join(perm)
            if w in words:
                found.add(w)
                if len(found) >= cap:
                    return len(found)
    return len(found)


def _rich_letters() -> list[str]:
    """A hand that can make at least MIN_DUEL_WORDS words, so no round is a dud."""
    letters = _deal_letters()
    for _ in range(20):
        if _formable_count(letters, MIN_DUEL_WORDS) >= MIN_DUEL_WORDS:
            return letters
        letters = _deal_letters()
    return letters


class WordDuel(BaseGame):
    type = "word_duel"
    name = "Word Duel"
    tagline = "Same 6 letters. Make the most, highest total wins."
    category = "words"
    total_rounds = 5
    round_time = 22.0
    result_delay = 4.5
    mode = SIMULTANEOUS
    versus_accumulate = True  # 1v1 is a head-to-head hunt: every word counts, total wins
    solo_kind = "words"  # one letter set, 60s; submit many words, score accumulates

    def solo_word(self, letters: list[str], word: str) -> int:
        """Length of the word if it's valid for the dealt letters, else 0."""
        word = str(word).strip().upper()
        return len(word) if _is_valid(word, letters) else 0

    def solo_metric(self, score: int, game_state: dict[str, Any]) -> str:
        words = len((game_state.get("solo_state") or {}).get("used", []))
        return f"{score} pts · {words} words"

    def new_round(self, round_number: int) -> tuple[dict[str, Any], dict[str, Any]]:
        letters = _rich_letters()  # guaranteed to make a decent number of words
        public = {"letters": letters, "round_time": self.round_time}
        secret = {"letters": letters}
        return public, secret

    def resolve(
        self,
        public: dict[str, Any],
        secret: dict[str, Any],
        actions: dict[str, dict[str, Any]],
    ) -> dict[str, int]:
        """Head-to-head: each player's round score is the summed length of every
        valid word they made (deduped as they went). The engine adds these across
        the rounds, so the match goes to the higher TOTAL, not a single best word."""
        letters = secret["letters"]
        scores: dict[str, int] = {}
        for player_id, action in actions.items():
            words = action.get("words") or []
            scores[player_id] = sum(len(w) for w in words if _is_valid(w, letters))
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
        hunt: dict[str, Any] = {}
        for player_id, action in actions.items():
            valid = [w for w in (action.get("words") or []) if _is_valid(w, letters)]
            valid.sort(key=len, reverse=True)
            hunt[player_id] = {
                "words": valid[:10],       # the longest ten, for the reveal
                "count": len(valid),
                "points": points.get(player_id, 0),
            }
        return {"hunt": hunt}
