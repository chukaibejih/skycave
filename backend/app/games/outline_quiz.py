"""Outline Quiz — name the country from its silhouette.

Race mode, multiple choice — mechanically the same as Flag Rush, but the prompt
is a country *outline* instead of a flag. Restricted to a curated set of
recognizable shapes so the game stays fair (tiny island nations make poor
silhouettes). Outline SVGs are bundled on the frontend at /outlines/{code}.svg.
"""
from __future__ import annotations

import json
import random
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.games.base import RACE, BaseGame

_DATA = Path(__file__).parent / "data" / "flags.json"

# Curated, recognizable country outlines (ISO alpha-2, lowercase).
CURATED = (
    "fr it es pt de gb ie nl be ch at pl cz se no fi dk gr tr ua is ro "
    "us ca mx br ar cl pe co ve bo ec "
    "cn jp kr in id th vn ph my pk sa ae ir iq il af np lk bd mm kz "
    "eg za ng ke et ma dz ly sd gh tz ao mz na ml so td "
    "au nz"
).split()


@lru_cache
def _countries() -> list[dict[str, Any]]:
    with _DATA.open(encoding="utf-8") as f:
        by_code = {c["code"]: c for c in json.load(f)}
    return [by_code[c] for c in CURATED if c in by_code]


class OutlineQuiz(BaseGame):
    type = "outline_quiz"
    name = "Outline Quiz"
    tagline = "Name the country from its outline. First correct wins."
    total_rounds = 10
    round_time = 10.0
    result_delay = 2.0
    mode = RACE

    def new_round(self, round_number: int) -> tuple[dict[str, Any], dict[str, Any]]:
        countries = _countries()
        target = random.choice(countries)
        distractors = random.sample(
            [c for c in countries if c["code"] != target["code"]], 3
        )
        options = [{"code": c["code"], "name": c["name"]} for c in [target, *distractors]]
        random.shuffle(options)
        public = {
            "code": target["code"],  # frontend renders /outlines/{code}.svg
            "options": options,
            "round_time": self.round_time,
        }
        secret = {"code": target["code"], "name": target["name"]}
        return public, secret

    def check(
        self, public: dict[str, Any], secret: dict[str, Any], action: dict[str, Any]
    ) -> bool:
        code = action.get("code")
        return code is not None and str(code).lower() == secret["code"]

    def reveal(self, public: dict[str, Any], secret: dict[str, Any]) -> dict[str, Any]:
        return {"code": secret["code"], "name": secret["name"]}
