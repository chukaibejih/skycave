"""Tile Takeover - a Filler-style flood battle.

A board of coloured tiles. You own one corner, your opponent the other. On your
turn you pick a colour (not your current one, not the opponent's): your whole
territory becomes that colour and swallows every adjacent tile already of it.
Play alternates until the board is full; most tiles wins. Zero data, every board
is different. Solo plays against a greedy server-side AI.
"""
from __future__ import annotations

import random
from typing import Any

from app.games.base import TURN_BASED, BaseGame

COLS = 7
ROWS = 9
NCOLORS = 6


def _neighbors4(idx: int, cols: int, rows: int) -> list[int]:
    r, c = divmod(idx, cols)
    out = []
    if r > 0:
        out.append(idx - cols)
    if r < rows - 1:
        out.append(idx + cols)
    if c > 0:
        out.append(idx - 1)
    if c < cols - 1:
        out.append(idx + 1)
    return out


def _absorb(tiles: list[int], owner: list[str | None], pid: str, color: int,
            cols: int, rows: int) -> None:
    """Recolour pid's territory to `color`, then flood-absorb adjacent matches.

    Mutates `tiles`/`owner` in place.
    """
    for i in range(len(owner)):
        if owner[i] == pid:
            tiles[i] = color
    changed = True
    while changed:
        changed = False
        for i in range(len(owner)):
            if owner[i] is None and tiles[i] == color:
                if any(owner[n] == pid for n in _neighbors4(i, cols, rows)):
                    owner[i] = pid
                    changed = True


class TileTakeover(BaseGame):
    type = "tile_takeover"
    name = "Tile Takeover"
    tagline = "Flood the board. Claim the most tiles."
    total_rounds = 1
    mode = TURN_BASED
    solo_enabled = True

    # ---- board setup ----
    def init_turn_state(self, player_ids: list[str]) -> dict[str, Any]:
        a, b = player_ids[0], player_ids[1]
        n = COLS * ROWS
        tiles = [random.randrange(NCOLORS) for _ in range(n)]
        a_corner = (ROWS - 1) * COLS          # bottom-left
        b_corner = COLS - 1                    # top-right
        # The two starting tiles must differ, else a player's opening is blocked.
        while tiles[a_corner] == tiles[b_corner]:
            tiles[b_corner] = random.randrange(NCOLORS)
        owner: list[str | None] = [None] * n
        owner[a_corner] = a
        owner[b_corner] = b
        return {
            "cols": COLS,
            "rows": ROWS,
            "ncolors": NCOLORS,
            "tiles": tiles,
            "owner": owner,
            "order": [a, b],
            "turn": a,
            "pcolor": {a: tiles[a_corner], b: tiles[b_corner]},
            "moves": 0,
        }

    # ---- move ----
    def _opponent(self, state: dict[str, Any], pid: str) -> str:
        a, b = state["order"]
        return b if pid == a else a

    def apply_turn(
        self, state: dict[str, Any], player_id: str, action: dict[str, Any]
    ) -> dict[str, Any] | None:
        if state["turn"] != player_id:
            return None
        try:
            color = int(action.get("color"))
        except (TypeError, ValueError):
            return None
        if not (0 <= color < state["ncolors"]):
            return None
        opp = self._opponent(state, player_id)
        # Can't keep your colour or steal the opponent's current colour.
        if color == state["pcolor"][player_id] or color == state["pcolor"][opp]:
            return None

        tiles = list(state["tiles"])
        owner = list(state["owner"])
        _absorb(tiles, owner, player_id, color, state["cols"], state["rows"])
        pcolor = dict(state["pcolor"])
        pcolor[player_id] = color
        return {
            **state,
            "tiles": tiles,
            "owner": owner,
            "pcolor": pcolor,
            "turn": opp,
            "moves": state["moves"] + 1,
        }

    # ---- lifecycle ----
    def turn_over(self, state: dict[str, Any]) -> bool:
        if all(o is not None for o in state["owner"]):
            return True
        # Safety valve against a pathological stall (should never fire).
        return state["moves"] >= state["cols"] * state["rows"] * 2

    def turn_scores(self, state: dict[str, Any]) -> dict[str, int]:
        return {
            pid: sum(1 for o in state["owner"] if o == pid)
            for pid in state["order"]
        }

    def turn_public(self, state: dict[str, Any]) -> dict[str, Any]:
        return {
            "cols": state["cols"],
            "rows": state["rows"],
            "ncolors": state["ncolors"],
            "tiles": state["tiles"],
            "owner": state["owner"],
            "order": state["order"],
            "turn": state["turn"],
            "pcolor": state["pcolor"],
            "scores": self.turn_scores(state),
        }

    def turn_metric(self, score: int, state: dict[str, Any]) -> str:
        total = state["cols"] * state["rows"]
        return f"{score} of {total} tiles"

    def solo_metric(self, score: int, game_state: dict[str, Any]) -> str:
        # Solo persistence goes through solo_metric; delegate to the turn tally.
        st = game_state.get("turn_state") or {}
        return self.turn_metric(score, st) if st else f"{score} tiles"

    # ---- solo AI (greedy: grab the most tiles this turn) ----
    def ai_move(self, state: dict[str, Any], player_id: str) -> dict[str, Any] | None:
        opp = self._opponent(state, player_id)
        forbidden = {state["pcolor"][player_id], state["pcolor"][opp]}
        before = sum(1 for o in state["owner"] if o == player_id)
        best_color, best_gain = None, -1
        for color in range(state["ncolors"]):
            if color in forbidden:
                continue
            tiles = list(state["tiles"])
            owner = list(state["owner"])
            _absorb(tiles, owner, player_id, color, state["cols"], state["rows"])
            gain = sum(1 for o in owner if o == player_id) - before
            if gain > best_gain:
                best_color, best_gain = color, gain
        return {"color": best_color} if best_color is not None else None
