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
from datetime import date
from typing import Any

from app.games.base import SIMULTANEOUS, BaseGame

ROWS = 64          # profile samples top->bottom; client and server must agree
MAXR = 132.0       # widest allowed radius (px in the client's canvas units)

# The glaze palette is owned HERE and shipped with the round, so the swatches a
# player can pick are always exactly the colours a target can ask for. (They used
# to be declared separately client-side, which let targets request unmatchable
# colours.)
CLAY = "#c0503b"
VIOLET = "#8b7cff"
CYAN = "#67e8f9"
GOLD = "#ffd166"
WHITE = "#f5f7ff"
GREEN = "#2e7d5b"
GLAZES = [CLAY, VIOLET, CYAN, GOLD, WHITE, GREEN]

# (name, shape keyframes [(t, radius_fraction)], glaze bands [(t0, t1, hex)])
# t is normalized height: 0 = rim/top, 1 = base. A radius near 0 means "no clay
# at this height", which is how the short forms (bowls, cups) sit low on the
# wheel. Every target carries at least one glaze band so the glaze score is
# always earned rather than given away.
TARGETS: list[tuple[str, list[tuple[float, float]], list[tuple[float, float, str]]]] = [
    # --- classic vases / jars ---
    ("Belly jar", [(0, .40), (.07, .27), (.16, .38), (.40, .94), (.58, .82), (.80, .34), (1, .30)],
     [(0, .09, VIOLET), (.34, .60, CYAN)]),
    ("Bud vase", [(0, .33), (.10, .19), (.24, .25), (.46, .35), (.66, .31), (.86, .27), (1, .25)],
     [(0, .11, GOLD)]),
    ("Amphora", [(0, .30), (.08, .22), (.20, .52), (.36, .80), (.50, .63), (.66, .83), (.82, .40), (1, .30)],
     [(0, .07, CLAY), (.44, .66, GREEN)]),
    ("Ginger jar", [(0, .28), (.08, .24), (.22, .62), (.42, .88), (.62, .82), (.84, .50), (1, .40)],
     [(0, .10, CYAN), (.30, .58, WHITE)]),
    ("Olla", [(0, .22), (.06, .18), (.20, .66), (.42, .92), (.66, .86), (.88, .46), (1, .36)],
     [(.30, .70, CLAY)]),
    ("Stout jug", [(0, .34), (.12, .28), (.28, .62), (.50, .84), (.72, .80), (.90, .52), (1, .44)],
     [(0, .12, GREEN), (.46, .78, GOLD)]),
    ("Pitcher", [(0, .40), (.14, .32), (.30, .56), (.52, .82), (.74, .74), (.92, .44), (1, .38)],
     [(.26, .56, VIOLET)]),
    ("Cauldron", [(0, .46), (.10, .42), (.30, .80), (.55, .92), (.80, .70), (1, .44)],
     [(0, .12, WHITE), (.40, .74, CLAY)]),
    ("Urn", [(0, .44), (.10, .36), (.30, .84), (.55, .60), (.78, .44), (.92, .56), (1, .50)],
     [(.24, .48, GOLD), (.84, 1, VIOLET)]),
    ("Moon jar", [(0, .34), (.09, .30), (.26, .74), (.48, .90), (.70, .78), (.90, .44), (1, .38)],
     [(.20, .80, WHITE)]),

    # --- bottles / long necks ---
    ("Bottle", [(0, .20), (.28, .16), (.38, .30), (.55, .80), (.72, .78), (.90, .42), (1, .34)],
     [(0, .30, CYAN), (.50, .78, CLAY)]),
    ("Carafe", [(0, .26), (.18, .20), (.34, .46), (.55, .86), (.75, .70), (.92, .40), (1, .36)],
     [(.48, .80, GREEN)]),
    ("Bulb vase", [(0, .22), (.30, .18), (.48, .24), (.64, .72), (.82, .78), (.95, .46), (1, .40)],
     [(0, .34, GOLD), (.60, .88, VIOLET)]),
    ("Swan neck", [(0, .18), (.22, .14), (.40, .22), (.60, .66), (.80, .72), (.94, .44), (1, .36)],
     [(.56, .84, CYAN)]),
    ("Decanter", [(0, .24), (.14, .18), (.30, .34), (.52, .78), (.76, .84), (.93, .48), (1, .40)],
     [(0, .16, WHITE), (.46, .82, CLAY)]),

    # --- straight / tapered forms ---
    ("Tumbler", [(0, .52), (.34, .50), (.68, .48), (1, .46)],
     [(0, .16, VIOLET), (.70, 1, VIOLET)]),
    ("Tall cylinder", [(0, .44), (.30, .44), (.70, .44), (1, .42)],
     [(.34, .62, GOLD)]),
    ("Beaker", [(0, .58), (.35, .52), (.70, .48), (1, .50)],
     [(0, .14, CLAY)]),
    ("Column", [(0, .40), (.06, .48), (.14, .40), (.60, .40), (.90, .42), (1, .46)],
     [(0, .16, GREEN), (.86, 1, GREEN)]),
    ("Tapered vase", [(0, .56), (.25, .48), (.55, .38), (.80, .30), (1, .26)],
     [(.18, .52, CYAN)]),
    ("Spindle", [(0, .26), (.20, .30), (.50, .44), (.80, .32), (1, .26)],
     [(.36, .64, WHITE)]),
    ("Cone pot", [(0, .24), (.30, .42), (.60, .62), (.85, .78), (1, .72)],
     [(.55, .90, CLAY)]),

    # --- flared / sculpted ---
    ("Flare cup", [(0, .72), (.30, .56), (.70, .36), (1, .28)],
     [(0, .18, GOLD)]),
    ("Trumpet vase", [(0, .86), (.20, .58), (.42, .34), (.66, .26), (.86, .30), (1, .38)],
     [(0, .16, VIOLET), (.72, 1, CLAY)]),
    ("Chalice", [(0, .62), (.22, .52), (.34, .30), (.55, .14), (.78, .16), (.90, .44), (1, .58)],
     [(0, .24, GOLD), (.84, 1, GOLD)]),
    ("Hourglass", [(0, .62), (.22, .56), (.50, .28), (.78, .58), (1, .62)],
     [(.38, .62, CYAN)]),
    ("Bell", [(0, .30), (.25, .34), (.50, .44), (.75, .66), (.92, .88), (1, .80)],
     [(.70, 1, GREEN)]),
    ("Gourd", [(0, .24), (.10, .18), (.26, .50), (.38, .44), (.55, .86), (.75, .76), (.92, .40), (1, .32)],
     [(.20, .42, GOLD), (.50, .80, GREEN)]),

    # --- short forms: no clay up top, the pot sits low on the wheel ---
    ("Wide bowl", [(0, .02), (.44, .02), (.50, .86), (.62, .88), (.80, .62), (1, .36)],
     [(.48, .60, WHITE)]),
    ("Deep bowl", [(0, .02), (.30, .02), (.36, .78), (.55, .88), (.80, .55), (1, .34)],
     [(.34, .50, CLAY), (.70, .92, CYAN)]),
    ("Squat pot", [(0, .02), (.22, .02), (.30, .62), (.50, .92), (.75, .80), (1, .44)],
     [(.28, .46, VIOLET)]),
    ("Teacup", [(0, .02), (.38, .02), (.46, .66), (.66, .72), (.86, .42), (1, .30)],
     [(.44, .56, GOLD)]),
    ("Saucer bowl", [(0, .02), (.56, .02), (.62, .90), (.78, .80), (1, .42)],
     [(.60, .74, GREEN)]),
]

# A fixed shuffle of the catalogue, walked one step per day, so the Daily Pot
# feels unordered and can't repeat until every target has been used. Seeded with
# a constant so every server/restart agrees on the same order.
_DAILY_ORDER = list(range(len(TARGETS)))
random.Random(20260101).shuffle(_DAILY_ORDER)


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
    round_time = 45.0      # every mode runs on the same 45s clock
    result_delay = 3.0

    solo_kind = "canvas"   # client submits a shaped pot; engine scores it
    solo_duration = 45.0

    daily_bonus = 150      # added to the Daily Pot score (return/participation)
    daily_duration = 45.0

    def _pick(self, round_number: int) -> int:
        """Which target this round. Random for solo/1v1; the Daily Pot uses a
        date seed instead so everyone gets the same pot that day."""
        return random.randrange(len(TARGETS))

    def _build(self, idx: int, round_time: float) -> tuple[dict[str, Any], dict[str, Any]]:
        radius, glaze = target_arrays(idx)
        public = {
            "target": {"name": TARGETS[idx][0], "radius": radius, "glaze": glaze},
            "rows": ROWS,
            "max_r": MAXR,
            "round_time": round_time,
            "glazes": GLAZES,  # the swatches the client offers == what targets ask for
        }
        return public, {"idx": idx}

    def new_round(self, round_number: int) -> tuple[dict[str, Any], dict[str, Any]]:
        return self._build(self._pick(round_number), self.round_time)

    def new_round_seeded(self, round_number: int, seed: int) -> tuple[dict[str, Any], dict[str, Any]]:
        """Deterministic target for the Daily Pot — the same pot for everyone that
        day (that's the whole point of a daily), but walking a shuffled order so
        it never marches predictably and won't repeat until all are used.

        `seed` is YYYYMMDD; convert to an ordinal day so the step is exactly 1/day
        across month and year boundaries.
        """
        y, m, d = seed // 10000, (seed // 100) % 100, seed % 100
        try:
            day = date(y, m, d).toordinal()
        except ValueError:  # defensive: never let a bad seed break the round
            day = seed
        return self._build(_DAILY_ORDER[day % len(_DAILY_ORDER)], self.daily_duration)

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

    def result_details(
        self,
        public: dict[str, Any],
        secret: dict[str, Any],
        actions: dict[str, dict[str, Any]],
        points: dict[str, int],
    ) -> dict[str, Any]:
        """Every player's finished pot, so the result can show them side by side.

        Half the fun of a pot-off is seeing what the other person made, and the
        client only ever has its own pot. Sanitised here rather than trusted:
        these arrays came from a client and get re-broadcast to the opponent.
        """
        pots: dict[str, Any] = {}
        for pid, a in actions.items():
            prof = a.get("profile") or []
            if len(prof) != ROWS:
                continue
            try:
                radius = [round(min(MAXR, max(0.0, float(r))), 1) for r in prof]
            except (TypeError, ValueError):
                continue
            glaze = a.get("glaze") or []
            pots[pid] = {
                "profile": radius,
                "glaze": [
                    g if isinstance(g, str) and g in GLAZES else None
                    for g in (list(glaze) + [None] * ROWS)[:ROWS]
                ],
                "collapsed": bool(a.get("collapsed")),
            }
        return {"pots": pots} if pots else {}

    def solo_metric(self, score: int, game_state: dict[str, Any]) -> str:
        return f"{score:,} pts"
