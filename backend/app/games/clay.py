"""Clay — shape a spinning pot on the wheel toward a target, then it is scored.

Unlike the other games the *gameplay* is a client-side canvas (see the frontend
Clay component): the player pulls a lump of clay into shape and paints a glaze
against a 60s clock. But scoring stays server-authoritative: the client submits
its final pot (a radius profile + a per-row glaze) and the SERVER scores it
against the target it issued. Only the small "nerve" bonus is client-reported.

Modes:
  - 1v1  -> SIMULTANEOUS: both players shape the same target, resolve() scores
            each submitted pot, higher score wins.
  - solo -> a "canvas" solo_kind (see game_engine): fixed 60s session, the
            client submits its pot and the engine scores it via resolve().

Daily Pot (once/day, 45s, date-seeded target, bonus) is layered on in a later
phase; the scoring + target machinery here is shared by all three.
"""
from __future__ import annotations

import math
import random
from typing import Any

from app.games.base import SIMULTANEOUS, BaseGame

ROWS = 64          # profile samples top->bottom; client and server must agree
MAXR = 132.0       # widest allowed radius (px in the client's canvas units)

# (name, shape keyframes [(t, radius_fraction)], glaze bands [(t0, t1, hex)])
# t is normalized height 0 (rim) .. 1 (base). Ported from the prototype.
TARGETS: list[tuple[str, list[tuple[float, float]], list[tuple[float, float, str]]]] = [
    ("Belly jar", [(0, .40), (.07, .27), (.16, .38), (.40, .94), (.58, .82), (.80, .34), (1, .30)],
     [(0, .09, "#8b7cff"), (.34, .60, "#67e8f9")]),
    ("Bud vase", [(0, .33), (.10, .19), (.24, .25), (.46, .35), (.66, .31), (.86, .27), (1, .25)],
     [(0, .11, "#ffd166")]),
    ("Amphora", [(0, .30), (.08, .22), (.20, .52), (.36, .80), (.50, .63), (.66, .83), (.82, .40), (1, .30)],
     [(0, .07, "#ff725e"), (.44, .66, "#56f0aa")]),
]


def _interp(keys: list[tuple[float, float]], i: int) -> float:
    """Smoothstep-interpolated target radius at row i."""
    t = i / (ROWS - 1)
    for k in range(len(keys) - 1):
        t0, r0 = keys[k]
        t1, r1 = keys[k + 1]
        if t0 <= t <= t1:
            f = (t - t0) / (t1 - t0) if t1 > t0 else 0.0
            s = f * f * (3 - 2 * f)
            return (r0 + (r1 - r0) * s) * MAXR
    return keys[-1][1] * MAXR


def _band(bands: list[tuple[float, float, str]], i: int) -> str | None:
    t = i / (ROWS - 1)
    for a, b, hexc in bands:
        if a <= t <= b:
            return hexc
    return None


def target_arrays(idx: int) -> tuple[list[float], list[str | None]]:
    """The target as row-aligned arrays: (radius[ROWS], glaze[ROWS])."""
    _, keys, bands = TARGETS[idx]
    radius = [round(_interp(keys, i), 2) for i in range(ROWS)]
    glaze = [_band(bands, i) for i in range(ROWS)]
    return radius, glaze


def _rgb(c: str) -> tuple[int, int, int]:
    c = c.lstrip("#")
    return int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)


def _color_dist(a: str, b: str) -> float:
    ax, ay, az = _rgb(a)
    bx, by, bz = _rgb(b)
    return math.sqrt((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2)


def score_pot(
    target_radius: list[float], target_glaze: list[str | None], action: dict[str, Any]
) -> int:
    """Server-authoritative score for a submitted pot (0..1000).

    shape match (600) + glaze match (300) + client-reported nerve bonus (100).
    A collapsed pot forfeits the nerve bonus.
    """
    prof = action.get("profile") or []
    glaze = action.get("glaze") or []

    # shape: mean absolute radius difference vs the target, normalized
    if len(prof) == ROWS:
        try:
            diff = sum(abs(float(prof[i]) - target_radius[i]) for i in range(ROWS)) / ROWS
        except (TypeError, ValueError):
            diff = 0.34 * MAXR
        shape = max(0.0, min(1.0, 1 - diff / (0.34 * MAXR)))
    else:
        shape = 0.0

    # glaze: average color match over the rows the target glazes
    total, count = 0.0, 0
    for i in range(ROWS):
        tg = target_glaze[i]
        if tg:
            count += 1
            pg = glaze[i] if i < len(glaze) else None
            if isinstance(pg, str) and pg:
                try:
                    total += max(0.0, 1 - _color_dist(pg, tg) / 150.0)
                except (ValueError, IndexError):
                    pass
    glaze_match = (total / count) if count else 1.0

    # nerve: client-reported stability; a collapse zeroes it
    if action.get("collapsed"):
        nerve = 0.0
    else:
        try:
            nerve = max(0.0, min(1.0, float(action.get("stability", 0))))
        except (TypeError, ValueError):
            nerve = 0.0

    return round(shape * 600 + glaze_match * 300 + nerve * 100)


class Clay(BaseGame):
    type = "clay"
    name = "Clay"
    tagline = "Shape the spinning pot to match the target. Closest wins."
    mode = SIMULTANEOUS
    total_rounds = 1
    round_time = 60.0
    result_delay = 3.0

    solo_kind = "canvas"   # client submits a shaped pot; engine scores it
    solo_duration = 60.0

    def _pick(self, round_number: int) -> int:
        """Which target this round. Random for solo/1v1; the Daily Pot overrides
        this with a date seed so everyone gets the same pot that day."""
        return random.randrange(len(TARGETS))

    def new_round(self, round_number: int) -> tuple[dict[str, Any], dict[str, Any]]:
        idx = self._pick(round_number)
        radius, glaze = target_arrays(idx)
        public = {
            "target": {"name": TARGETS[idx][0], "radius": radius, "glaze": glaze},
            "rows": ROWS,
            "max_r": MAXR,
            "round_time": self.round_time,
        }
        return public, {"idx": idx}

    def resolve(
        self,
        public: dict[str, Any],
        secret: dict[str, Any],
        actions: dict[str, dict[str, Any]],
    ) -> dict[str, int]:
        tr = public["target"]["radius"]
        tg = public["target"]["glaze"]
        return {pid: score_pot(tr, tg, a) for pid, a in actions.items()}

    def reveal(self, public: dict[str, Any], secret: dict[str, Any]) -> dict[str, Any]:
        return {}  # the target was already public; nothing hidden to reveal

    def solo_metric(self, score: int, game_state: dict[str, Any]) -> str:
        return f"{score:,} pts"
