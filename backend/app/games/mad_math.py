"""Mad Math - rapid mental arithmetic.

A problem like "7 x 8" appears with four numeric options; first to tap the
correct answer wins the round (race). Solo is beat-the-clock: how many can you
solve in 60 seconds. Problems are generated, so there is no bank to exhaust.
"""
from __future__ import annotations

import random
from typing import Any

from app.games.base import RACE, BaseGame


def _problem() -> tuple[str, int]:
    """Return (display, answer) for one arithmetic problem."""
    op = random.choice(["+", "+", "-", "-", "x"])  # slightly favor +/- over x
    if op == "+":
        a, b = random.randint(2, 49), random.randint(2, 49)
        return f"{a} + {b}", a + b
    if op == "-":
        a, b = random.randint(2, 50), random.randint(2, 50)
        if b > a:
            a, b = b, a  # keep the answer non-negative
        return f"{a} - {b}", a - b
    a, b = random.randint(2, 12), random.randint(2, 12)
    return f"{a} x {b}", a * b


def _options(answer: int) -> list[int]:
    """Four distinct plausible options including the answer, shuffled."""
    opts = {answer}
    while len(opts) < 4:
        cand = answer + random.choice([-10, -6, -3, -2, -1, 1, 2, 3, 6, 10])
        if cand >= 0:
            opts.add(cand)
    out = list(opts)
    random.shuffle(out)
    return out


class MadMath(BaseGame):
    type = "mad_math"
    name = "Mad Math"
    tagline = "Solve it first. Rapid mental math."
    total_rounds = 10
    round_time = 8.0
    result_delay = 2.2
    mode = RACE
    solo_kind = "timed"  # beat-the-clock: count correct in 60s
    solo_advance_on_miss = False  # a wrong tap keeps the same problem to retry

    def solo_metric(self, score: int, game_state: dict[str, Any]) -> str:
        return f"{score} correct · 60 seconds"

    def new_round(self, round_number: int) -> tuple[dict[str, Any], dict[str, Any]]:
        problem, answer = _problem()
        public = {
            "problem": problem,
            "options": _options(answer),
            "round_time": self.round_time,
        }
        secret = {"answer": answer}
        return public, secret

    def check(
        self, public: dict[str, Any], secret: dict[str, Any], action: dict[str, Any]
    ) -> bool:
        try:
            return int(action.get("choice")) == secret["answer"]
        except (TypeError, ValueError):
            return False

    def reveal(self, public: dict[str, Any], secret: dict[str, Any]) -> dict[str, Any]:
        return {"answer": secret["answer"]}
