"""Connect 4 - drop discs down a 7x6 grid, line up four to win.

Turn-based (same engine as Tile Takeover): one evolving board, players alternate
until someone connects four or the board fills. Zero data, deterministic rules.
Solo plays against a minimax server-side AI (the Caver).

Board is indexed row-major with row 0 at the TOP, so a dropped disc lands in the
lowest empty row of its column.
"""
from __future__ import annotations

from typing import Any

from app.games.base import TURN_BASED, BaseGame

COLS = 7
ROWS = 6
AI_DEPTH = 5  # minimax lookahead for the Caver (fast at 7 wide)


def _idx(r: int, c: int) -> int:
    return r * COLS + c


# All length-4 windows (horizontal, vertical, both diagonals), precomputed once.
def _all_windows() -> list[tuple[int, int, int, int]]:
    w: list[tuple[int, int, int, int]] = []
    for r in range(ROWS):
        for c in range(COLS):
            if c + 3 < COLS:
                w.append((_idx(r, c), _idx(r, c + 1), _idx(r, c + 2), _idx(r, c + 3)))
            if r + 3 < ROWS:
                w.append((_idx(r, c), _idx(r + 1, c), _idx(r + 2, c), _idx(r + 3, c)))
            if c + 3 < COLS and r + 3 < ROWS:
                w.append((_idx(r, c), _idx(r + 1, c + 1), _idx(r + 2, c + 2), _idx(r + 3, c + 3)))
            if c - 3 >= 0 and r + 3 < ROWS:
                w.append((_idx(r, c), _idx(r + 1, c - 1), _idx(r + 2, c - 2), _idx(r + 3, c - 3)))
    return w


_WINDOWS = _all_windows()


def _drop_row(owner: list[str | None], col: int) -> int | None:
    """Lowest empty row in a column (where a disc would land), or None if full."""
    for r in range(ROWS - 1, -1, -1):
        if owner[_idx(r, col)] is None:
            return r
    return None


def _place(owner: list[str | None], col: int, pid: str) -> tuple[list[str | None], int] | None:
    r = _drop_row(owner, col)
    if r is None:
        return None
    nxt = list(owner)
    i = _idx(r, col)
    nxt[i] = pid
    return nxt, i


def _win_cells(owner: list[str | None], last: int, pid: str) -> list[int]:
    """The connected-four (or more) cells through `last` for pid, else []."""
    r0, c0 = divmod(last, COLS)
    for dr, dc in ((0, 1), (1, 0), (1, 1), (1, -1)):
        cells = [last]
        for sign in (1, -1):
            r, c = r0 + dr * sign, c0 + dc * sign
            while 0 <= r < ROWS and 0 <= c < COLS and owner[_idx(r, c)] == pid:
                cells.append(_idx(r, c))
                r += dr * sign
                c += dc * sign
        if len(cells) >= 4:
            return sorted(cells)
    return []


def _has_won(owner: list[str | None], pid: str) -> bool:
    return any(owner[a] == pid and owner[b] == pid and owner[c] == pid and owner[d] == pid for a, b, c, d in _WINDOWS)


def _evaluate(owner: list[str | None], me: str, opp: str) -> int:
    """Heuristic for the depth cutoff: value each 4-window by how close it is to a
    line for me (positive) or the opponent (negative), plus a center-column bias."""
    score = 0
    center = COLS // 2
    for r in range(ROWS):
        if owner[_idx(r, center)] == me:
            score += 3
    for a, b, c, d in _WINDOWS:
        cells = (owner[a], owner[b], owner[c], owner[d])
        m = cells.count(me)
        o = cells.count(opp)
        if m and o:
            continue
        if m == 3:
            score += 60
        elif m == 2:
            score += 8
        elif o == 3:
            score -= 75  # value blocking a bit above building
        elif o == 2:
            score -= 8
    return score


def _minimax(owner, me, opp, turn, depth, alpha, beta):
    if _has_won(owner, me):
        return 100000 + depth, None  # prefer faster wins
    if _has_won(owner, opp):
        return -100000 - depth, None
    legal = [c for c in range(COLS) if owner[c] is None]
    if depth == 0 or not legal:
        return _evaluate(owner, me, opp), None
    order = sorted(legal, key=lambda c: abs(c - COLS // 2))  # center-first for pruning
    best = order[0]
    if turn == me:
        value = -(10 ** 9)
        for c in order:
            child, _ = _place(owner, c, me)
            v, _ = _minimax(child, me, opp, opp, depth - 1, alpha, beta)
            if v > value:
                value, best = v, c
            alpha = max(alpha, value)
            if alpha >= beta:
                break
    else:
        value = 10 ** 9
        for c in order:
            child, _ = _place(owner, c, opp)
            v, _ = _minimax(child, me, opp, me, depth - 1, alpha, beta)
            if v < value:
                value, best = v, c
            beta = min(beta, value)
            if alpha >= beta:
                break
    return value, best


class Connect4(BaseGame):
    type = "connect4"
    name = "Connect 4"
    tagline = "Drop discs. Line up four."
    total_rounds = 1
    mode = TURN_BASED
    solo_enabled = True

    def init_turn_state(self, player_ids: list[str]) -> dict[str, Any]:
        a, b = player_ids[0], player_ids[1]
        return {
            "cols": COLS,
            "rows": ROWS,
            "owner": [None] * (COLS * ROWS),
            "order": [a, b],
            "turn": a,
            "moves": 0,
            "winner": None,
            "win_cells": [],
        }

    def _opponent(self, state: dict[str, Any], pid: str) -> str:
        a, b = state["order"]
        return b if pid == a else a

    def apply_turn(self, state: dict[str, Any], player_id: str, action: dict[str, Any]) -> dict[str, Any] | None:
        if state["turn"] != player_id or state["winner"] is not None:
            return None
        try:
            col = int(action.get("col"))
        except (TypeError, ValueError):
            return None
        if not (0 <= col < COLS):
            return None
        placed = _place(state["owner"], col, player_id)
        if placed is None:
            return None  # column full
        owner, i = placed
        win = _win_cells(owner, i, player_id)
        return {
            **state,
            "owner": owner,
            "turn": self._opponent(state, player_id),
            "moves": state["moves"] + 1,
            "winner": player_id if win else None,
            "win_cells": win,
        }

    def turn_over(self, state: dict[str, Any]) -> bool:
        return state["winner"] is not None or all(o is not None for o in state["owner"])

    def turn_scores(self, state: dict[str, Any]) -> dict[str, int]:
        # Win = 1, everything else 0; a draw is 0-0. The engine takes the higher
        # score as the winner, so this yields the right result and a clean tie.
        w = state["winner"]
        return {pid: (1 if pid == w else 0) for pid in state["order"]}

    def turn_public(self, state: dict[str, Any]) -> dict[str, Any]:
        return {
            "cols": state["cols"],
            "rows": state["rows"],
            "owner": state["owner"],
            "order": state["order"],
            "turn": state["turn"],
            "winner": state["winner"],
            "win_cells": state["win_cells"],
            "scores": self.turn_scores(state),
        }

    def turn_metric(self, score: int, state: dict[str, Any]) -> str:
        return "connected four" if score else "no four this time"

    def solo_metric(self, score: int, game_state: dict[str, Any]) -> str:
        return "beat the Caver" if score else "lost to the Caver"

    def ai_move(self, state: dict[str, Any], player_id: str) -> dict[str, Any] | None:
        owner = state["owner"]
        legal = [c for c in range(COLS) if owner[c] is None]
        if not legal:
            return None
        opp = self._opponent(state, player_id)
        _, col = _minimax(owner, player_id, opp, player_id, AI_DEPTH, -(10 ** 9), 10 ** 9)
        return {"col": col if col is not None else legal[0]}
