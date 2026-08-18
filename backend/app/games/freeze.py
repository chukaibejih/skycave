"""Freeze - stop the marker as close to the target as you can.

A marker sweeps a track under a seeded motion pattern; you get one input, FREEZE,
and are scored by how close you stop it to the target. There is no countdown: the
marker is always moving THROUGH the target, never resting on it, so every freeze
is a live catch.

1v1 is SIMULTANEOUS: both players face the identical seeded motion, each commits
one freeze, and the round goes to whoever stopped closer (best of five). Solo is a
60-second sprint - how many near-perfect freezes can you land?

The motion lives on the CLIENT: it renders pos(t) from the seed in ``public`` (so
both players see identical movement), and on freeze it reports the marker's
position. The server only issues the seeded round and scores the reported
position, which keeps the whole game a thin, deterministic scoring layer with no
per-frame server state. (A determined client could report a perfect position; for
a casual social game that is an accepted trade for the tiny surface area, same as
every other game here. Easy to tighten later with server-side motion.)
"""
from __future__ import annotations

import random
from typing import Any

from app.games.base import SIMULTANEOUS, BaseGame

# Motion patterns the CLIENT knows how to render as pos(t) in [0,1]. The server
# only names one + a speed; the marker math lives in Freeze.tsx. Ordered roughly
# easy -> hard so a versus game ramps and a long solo run keeps getting tougher.
PATTERNS: list[dict[str, Any]] = [
    {"id": "sweep", "speed": 0.45},   # steady glide, end to end
    {"id": "sweep", "speed": 0.75},   # same, quicker
    {"id": "bounce", "speed": 0.65},  # ping-pong off the ends
    {"id": "accel", "speed": 0.6},    # eases slow-fast-slow across the track
    {"id": "reverse", "speed": 0.7},  # doubles back partway
    {"id": "fast", "speed": 1.05},    # blink and you miss it
]

# Closeness falls from 100% at the target to 0% this far away (half the track).
_SCALE = 0.5
# Solo scores by ACCURACY POINTS, not a count: each freeze earns points on a ramp
# from _FLOOR% (= 0 points) up to a dead-on freeze (= _MAX). Below the floor earns
# nothing, so sloppy freezes score 0 - and because points accumulate over the 60s,
# a great run is both many freezes AND precise ones. _FLOOR/_MAX are the knobs.
_FLOOR = 85
_MAX = 100
# A nominal track width in px, so a tight freeze can read "2 PX FROM PERFECT".
_NOMINAL_PX = 1000


def _pct(offset: float) -> int:
    """Closeness as 0-100: dead-on = 100, half a track away = 0."""
    return max(0, round(100 * (1 - min(offset, _SCALE) / _SCALE)))


def _offset(action: dict[str, Any] | None, target: float) -> float | None:
    """Absolute normalized distance from the frozen marker to the target, or None
    if the player never committed a valid freeze (a no-show / timeout)."""
    if not action:
        return None
    try:
        pos = float(action["pos"])
    except (KeyError, TypeError, ValueError):
        return None
    return abs(min(1.0, max(0.0, pos)) - target)


def _points(offset: float | None) -> int:
    """Accuracy points for one freeze: 0 below the floor, ramping to _MAX dead-on."""
    if offset is None:
        return 0
    return max(0, round((_pct(offset) - _FLOOR) / (100 - _FLOOR) * _MAX))


class Freeze(BaseGame):
    type = "freeze"
    name = "Freeze"
    tagline = "Stop it as close to the target as you can."
    category = "speed"
    total_rounds = 7           # best of seven
    round_time = 6.0           # seconds to commit a freeze (the marker loops within it)
    result_delay = 4.0
    mode = SIMULTANEOUS
    # Solo: a 60-second sprint scored by accuracy points (see solo_points). Default
    # high-score board ("best") is right - the board ranks by total points.
    solo_kind = "timed"
    solo_duration = 60.0
    solo_advance_on_miss = True  # each motion is one shot; a miss still moves on

    def new_round(self, round_number: int) -> tuple[dict[str, Any], dict[str, Any]]:
        """Round `n` picks the n-th pattern so a versus game ramps 1..5; past the
        ramp (a long solo run) it goes random so it never settles into one motion."""
        idx = round_number - 1
        pattern = PATTERNS[idx] if 0 <= idx < len(PATTERNS) else random.choice(PATTERNS)
        return self._round(pattern)

    def _round(self, pattern: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
        seed = random.randint(1, 2_000_000_000)
        # Keep the target off the extreme edges so it's always a moving catch.
        target = round(random.uniform(0.15, 0.85), 4)
        public = {
            "prompt": f"{pattern['id']}:{seed}",  # unique per round
            "seed": seed,
            "pattern": pattern["id"],
            "speed": pattern["speed"],
            "target": target,
            "target_w": 0.04,           # visual half-width of the target zone
            "round_time": self.round_time,
        }
        return public, {"target": target}

    # --- 1v1: SIMULTANEOUS, scored by closeness ------------------------------
    def resolve(
        self,
        public: dict[str, Any],
        secret: dict[str, Any],
        actions: dict[str, dict[str, Any]],
    ) -> dict[str, int]:
        """Round point to whoever froze strictly closer. A no-show or an exact
        tie awards nobody (the match winner is whoever takes more rounds)."""
        target = float(secret["target"])
        pcts: dict[str, int] = {}
        for pid, action in actions.items():
            off = _offset(action, target)
            pcts[pid] = _pct(off) if off is not None else -1
        best = max(pcts.values(), default=-1)
        winners = [pid for pid, p in pcts.items() if p == best and p >= 0]
        if best < 0 or len(winners) != 1:
            return {pid: 0 for pid in actions}
        return {pid: (1 if pid == winners[0] else 0) for pid in actions}

    def reveal(self, public: dict[str, Any], secret: dict[str, Any]) -> dict[str, Any]:
        return {"target": secret["target"]}

    def result_details(
        self,
        public: dict[str, Any],
        secret: dict[str, Any],
        actions: dict[str, dict[str, Any]],
        points: dict[str, int],
    ) -> dict[str, Any]:
        """Each player's freeze for the reveal screen: where they stopped, their
        closeness %, and a px-from-perfect figure for the share."""
        target = float(secret["target"])
        freezes: dict[str, Any] = {}
        for pid, action in actions.items():
            off = _offset(action, target)
            if off is None:
                freezes[pid] = {"pos": None, "pct": 0, "px": None, "points": points.get(pid, 0)}
            else:
                freezes[pid] = {
                    "pos": round(min(1.0, max(0.0, float(action["pos"]))), 4),
                    "pct": _pct(off),
                    "px": round(off * _NOMINAL_PX),
                    "points": points.get(pid, 0),
                }
        return {"freezes": freezes}

    # --- Solo: timed sprint scored by accuracy points ------------------------
    def check(
        self, public: dict[str, Any], secret: dict[str, Any], action: dict[str, Any]
    ) -> bool:
        """A freeze 'lands' (correct beat + next prompt) when it earns points."""
        return self.solo_points(public, secret, action) > 0

    def solo_points(
        self, public: dict[str, Any], secret: dict[str, Any], action: dict[str, Any]
    ) -> int:
        """Points for this freeze, precision-weighted (0 below the floor, up to
        _MAX dead-on). The timed-solo driver adds it to the running total."""
        return _points(_offset(action, float(secret["target"])))

    def solo_metric(self, score: int, game_state: dict[str, Any]) -> str:
        return f"{score:,} points · 60 seconds"
