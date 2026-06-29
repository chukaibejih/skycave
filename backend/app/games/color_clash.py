"""Color Clash — the Stroop game.

A color word ("RED") is rendered in a mismatched ink color (blue). The correct
answer is always the *ink* color, not the word. First player to tap the correct
ink color wins the round's point. Race mode. 10 rounds.
"""
from __future__ import annotations

import random
from typing import Any

from app.games.base import RACE, BaseGame

COLORS: list[dict[str, str]] = [
    {"label": "RED", "hex": "#FF5C5C"},
    {"label": "BLUE", "hex": "#5C8BFF"},
    {"label": "GREEN", "hex": "#4FFFB0"},
    {"label": "YELLOW", "hex": "#FFE45C"},
    {"label": "PURPLE", "hex": "#B96CFF"},
    {"label": "ORANGE", "hex": "#FF9B5C"},
]


class ColorClash(BaseGame):
    type = "color_clash"
    name = "Color Clash"
    tagline = "Tap the ink color, not the word. First correct wins."
    total_rounds = 10
    round_time = 8.0
    result_delay = 2.4
    mode = RACE
    solo_kind = "timed"  # beat-the-clock: count correct in 60s
    solo_advance_on_miss = True  # pure reflex — one tap per word, right or wrong

    def solo_metric(self, score: int, game_state: dict[str, Any]) -> str:
        return f"{score} correct · 60 seconds"

    def new_round(self, round_number: int) -> tuple[dict[str, Any], dict[str, Any]]:
        word = random.choice(COLORS)
        # Ink must differ from the word to create the Stroop conflict.
        ink = random.choice([c for c in COLORS if c["label"] != word["label"]])
        # Options are all six colors, shuffled — answer is the ink color.
        options = COLORS[:]
        random.shuffle(options)
        public = {
            "word": word["label"],          # the text shown
            "ink_hex": ink["hex"],          # color the text is drawn in
            "options": options,             # tappable color buttons
            "round_time": self.round_time,
        }
        secret = {"answer": ink["label"], "answer_hex": ink["hex"]}
        return public, secret

    def check(
        self, public: dict[str, Any], secret: dict[str, Any], action: dict[str, Any]
    ) -> bool:
        return str(action.get("choice", "")).upper() == secret["answer"]

    def reveal(self, public: dict[str, Any], secret: dict[str, Any]) -> dict[str, Any]:
        return {"answer": secret["answer"], "answer_hex": secret["answer_hex"]}
