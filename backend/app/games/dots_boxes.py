"""Dots and Boxes — draw edges between dots; complete a box to claim it and move
again. Most boxes when the grid fills wins.

Turn-based (same engine as Tile Takeover / Connect 4). Completing a box keeps
the turn, so both humans and the AI can chain captures (the engine re-invokes
ai_move while the turn stays with it). Solo plays a heuristic Caver: take free
boxes, otherwise play a safe edge, otherwise open the smallest sacrifice.

Grid is COLS x ROWS boxes, so (ROWS+1) x (COLS+1) dots. Edges are a flat id space:
ids [0, numH) are horizontal, [numH, numH+numV) are vertical.
"""
from __future__ import annotations

import random
from typing import Any

from app.games.base import TURN_BASED, BaseGame

COLS = 4  # boxes across
ROWS = 5  # boxes down


def _dims():
    numH = (ROWS + 1) * COLS
    numV = ROWS * (COLS + 1)
    return numH, numV


NUM_H, NUM_V = _dims()


def _h_index(r: int, c: int) -> int:
    return r * COLS + c


def _v_index(r: int, c: int) -> int:
    return r * (COLS + 1) + c


def _box_edges(r: int, c: int) -> tuple[tuple[str, int], tuple[str, int], tuple[str, int], tuple[str, int]]:
    return (
        ("h", _h_index(r, c)),        # top
        ("h", _h_index(r + 1, c)),    # bottom
        ("v", _v_index(r, c)),        # left
        ("v", _v_index(r, c + 1)),    # right
    )


def _decode(edge_id: int) -> tuple[str, int] | None:
    if 0 <= edge_id < NUM_H:
        return "h", edge_id
    if NUM_H <= edge_id < NUM_H + NUM_V:
        return "v", edge_id - NUM_H
    return None


def _box_of_edge(kind: str, idx: int) -> list[tuple[int, int]]:
    """The 1-2 boxes bordering an edge."""
    out: list[tuple[int, int]] = []
    if kind == "h":
        r, c = divmod(idx, COLS)
        if r < ROWS:
            out.append((r, c))       # this edge is that box's top
        if r > 0:
            out.append((r - 1, c))   # and the box above's bottom
    else:
        r, c = divmod(idx, COLS + 1)
        if c < COLS:
            out.append((r, c))       # left of this box
        if c > 0:
            out.append((r, c - 1))   # right of the box to the left
    return out


def _box_sides(h: list, v: list, r: int, c: int) -> int:
    return sum(1 for kind, i in _box_edges(r, c) if (h if kind == "h" else v)[i] is not None)


def _place_edge(h: list, v: list, boxes: list, edge_id: int, pid: str) -> int:
    """Draw an edge (mutating h/v/boxes); claim any boxes it completes for pid.
    Returns the number of boxes claimed by this move (0 if none)."""
    dec = _decode(edge_id)
    if dec is None:
        return -1
    kind, idx = dec
    arr = h if kind == "h" else v
    if arr[idx] is not None:
        return -1  # already drawn
    arr[idx] = pid
    claimed = 0
    for r, c in _box_of_edge(kind, idx):
        bi = r * COLS + c
        if boxes[bi] is None and _box_sides(h, v, r, c) == 4:
            boxes[bi] = pid
            claimed += 1
    return claimed


class DotsAndBoxes(BaseGame):
    type = "dots_boxes"
    name = "Dots and Boxes"
    tagline = "Close a box, go again. Most boxes wins."
    total_rounds = 1
    mode = TURN_BASED
    solo_enabled = True

    def init_turn_state(self, player_ids: list[str]) -> dict[str, Any]:
        a, b = player_ids[0], player_ids[1]
        return {
            "cols": COLS,
            "rows": ROWS,
            "num_h": NUM_H,
            "h": [None] * NUM_H,
            "v": [None] * NUM_V,
            "boxes": [None] * (COLS * ROWS),
            "order": [a, b],
            "turn": a,
            "moves": 0,
        }

    def _opponent(self, state: dict[str, Any], pid: str) -> str:
        a, b = state["order"]
        return b if pid == a else a

    def apply_turn(self, state: dict[str, Any], player_id: str, action: dict[str, Any]) -> dict[str, Any] | None:
        if state["turn"] != player_id:
            return None
        try:
            edge_id = int(action.get("edge"))
        except (TypeError, ValueError):
            return None
        h = list(state["h"])
        v = list(state["v"])
        boxes = list(state["boxes"])
        claimed = _place_edge(h, v, boxes, edge_id, player_id)
        if claimed < 0:
            return None  # illegal / already drawn
        return {
            **state,
            "h": h,
            "v": v,
            "boxes": boxes,
            # Completing at least one box earns another turn.
            "turn": player_id if claimed > 0 else self._opponent(state, player_id),
            "moves": state["moves"] + 1,
        }

    def turn_over(self, state: dict[str, Any]) -> bool:
        return all(o is not None for o in state["boxes"])

    def turn_scores(self, state: dict[str, Any]) -> dict[str, int]:
        return {pid: sum(1 for o in state["boxes"] if o == pid) for pid in state["order"]}

    def turn_public(self, state: dict[str, Any]) -> dict[str, Any]:
        return {
            "cols": state["cols"],
            "rows": state["rows"],
            "num_h": state["num_h"],
            "h": state["h"],
            "v": state["v"],
            "boxes": state["boxes"],
            "order": state["order"],
            "turn": state["turn"],
            "scores": self.turn_scores(state),
        }

    def turn_metric(self, score: int, state: dict[str, Any]) -> str:
        total = state["cols"] * state["rows"]
        return f"{score} of {total} boxes"

    def solo_metric(self, score: int, game_state: dict[str, Any]) -> str:
        st = game_state.get("turn_state") or {}
        return self.turn_metric(score, st) if st else f"{score} boxes"

    # ---- Caver AI: take free boxes, else play safe, else sacrifice least ----
    def ai_move(self, state: dict[str, Any], player_id: str) -> dict[str, Any] | None:
        h0, v0 = state["h"], state["v"]
        legal = [e for e in range(NUM_H + NUM_V) if self._undrawn(h0, v0, e)]
        if not legal:
            return None

        # a) Complete a box if possible (prefer the move that claims the most).
        best_e, best_gain = None, 0
        for e in legal:
            h, v, boxes = list(h0), list(v0), list(state["boxes"])
            gain = _place_edge(h, v, boxes, e, player_id)
            if gain > best_gain:
                best_gain, best_e = gain, e
        if best_e is not None:
            return {"edge": best_e}

        # b) Safe move: one that leaves no box on 3 sides for the opponent.
        safe = [e for e in legal if self._new_three_sided(h0, v0, e, player_id) == 0]
        if safe:
            return {"edge": random.choice(safe)}

        # c) Forced to give something up: open the fewest boxes.
        best_e = min(legal, key=lambda e: self._new_three_sided(h0, v0, e, player_id))
        return {"edge": best_e}

    @staticmethod
    def _undrawn(h: list, v: list, edge_id: int) -> bool:
        dec = _decode(edge_id)
        if dec is None:
            return False
        kind, idx = dec
        return (h if kind == "h" else v)[idx] is None

    @staticmethod
    def _new_three_sided(h0: list, v0: list, edge_id: int, pid: str) -> int:
        """Boxes that would sit on exactly 3 sides after drawing this edge (i.e.
        gifts to the opponent). Assumes the edge itself completes nothing."""
        h, v, boxes = list(h0), list(v0), [None] * (COLS * ROWS)
        _place_edge(h, v, boxes, edge_id, pid)
        return sum(1 for r in range(ROWS) for c in range(COLS) if _box_sides(h, v, r, c) == 3)
