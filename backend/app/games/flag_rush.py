"""Flag Rush — name the country from its flag.

A flag appears; first player to identify the country wins the point. Players
tap one of four multiple-choice options. Race mode. 10 rounds.

Flag images are bundled on the frontend at /flags/{code}.svg — no external API
at runtime. The country list (name + aliases) is bundled here in data/flags.json.
"""
from __future__ import annotations

import json
import random
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.games.base import RACE, BaseGame

_DATA = Path(__file__).parent / "data" / "flags.json"


@lru_cache
def _countries() -> list[dict[str, Any]]:
    with _DATA.open(encoding="utf-8") as f:
        return json.load(f)


class FlagRush(BaseGame):
    type = "flag_rush"
    name = "Flag Rush"
    tagline = "Name the country. First correct takes the point."
    total_rounds = 10
    round_time = 10.0
    result_delay = 2.0
    mode = RACE
    solo_kind = "timed"  # beat-the-clock: count correct in 60s
    solo_advance_on_miss = True  # one shot per flag, right or wrong

    def solo_metric(self, score: int, game_state: dict[str, Any]) -> str:
        return f"{score} correct · 60 seconds"

    def new_round(self, round_number: int) -> tuple[dict[str, Any], dict[str, Any]]:
        countries = _countries()
        target = random.choice(countries)
        # Three distractors for multiple-choice.
        distractors = random.sample(
            [c for c in countries if c["code"] != target["code"]], 3
        )
        options = [{"code": c["code"], "name": c["name"]} for c in [target, *distractors]]
        random.shuffle(options)
        public = {
            "code": target["code"],          # frontend renders /flags/{code}.svg
            "options": options,              # 4 tappable choices
            "round_time": self.round_time,
        }
        secret = {
            "code": target["code"],
            "name": target["name"],
        }
        return public, secret

    def check(
        self, public: dict[str, Any], secret: dict[str, Any], action: dict[str, Any]
    ) -> bool:
        code = action.get("code")
        if code is not None:
            return str(code).lower() == secret["code"]
        return False

    def reveal(self, public: dict[str, Any], secret: dict[str, Any]) -> dict[str, Any]:
        return {"code": secret["code"], "name": secret["name"]}
