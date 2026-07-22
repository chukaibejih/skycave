"""Reaction Grid - watch a sequence of tiles flash, reproduce it from memory.

Race mode: each round a sequence flashes on a 3x3 grid (shown to both players),
then players tap it back. First to reproduce the full sequence correctly wins
the point. Sequence length scales up each round. Pure procedural, no data.

The sequence is part of the public round data (both players must see it to play),
so this trusts that players reproduce from memory - fine for a casual game, and
the sequence space (9^len) makes blind guessing infeasible.
"""
from __future__ import annotations

import random
from typing import Any

from app.games.base import RACE, BaseGame

TILES = 9  # 3x3 grid
FLASH_MS = 620


class ReactionGrid(BaseGame):
    type = "reaction_grid"
    name = "Reaction Grid"
    tagline = "Watch the sequence, tap it back. First correct wins."
    total_rounds = 6
    round_time = 16.0
    result_delay = 2.0
    mode = RACE
    solo_kind = "ladder"  # endless; each correct sequence advances a level

    def solo_step_time(self, public: dict[str, Any]) -> float:
        # Time to watch the flash + tap it back, scaling with sequence length.
        seq_len = len(public.get("sequence", []))
        flash_total = seq_len * (FLASH_MS / 1000.0)
        return round(flash_total + 2.0 + seq_len * 1.1, 1)

    def solo_metric(self, score: int, game_state: dict[str, Any]) -> str:
        return f"reached level {score}" if score else "level 0"

    def _sequence(self, length: int) -> list[int]:
        seq: list[int] = []
        while len(seq) < length:
            t = random.randrange(TILES)
            if not seq or seq[-1] != t:  # avoid confusing immediate repeats
                seq.append(t)
        return seq

    def new_round(self, round_number: int) -> tuple[dict[str, Any], dict[str, Any]]:
        length = min(2 + round_number, 8)  # round 1 -> 3, capped at 8
        sequence = self._sequence(length)
        public = {
            "tiles": TILES,
            "sequence": sequence,   # shown to both players to memorize
            "flash_ms": FLASH_MS,
            "round_time": self.round_time,
        }
        secret = {"sequence": sequence}
        return public, secret

    def check(
        self, public: dict[str, Any], secret: dict[str, Any], action: dict[str, Any]
    ) -> bool:
        submitted = action.get("sequence")
        return (
            isinstance(submitted, list)
            and [int(x) for x in submitted] == secret["sequence"]
        )

    def reveal(self, public: dict[str, Any], secret: dict[str, Any]) -> dict[str, Any]:
        return {"sequence": secret["sequence"]}
