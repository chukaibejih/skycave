"""Crossing: the Skycave BaseGame wrapper around the pure engine.

Thin glue only - all rules, win/draw detection, and the bot live in
`crossing_engine`, shared verbatim by multiplayer and solo. A random board loads
each game. The engine is side-generic, so the room's turn_state IS the engine
state with real player ids in `order`/`turn`; no translation layer.
"""
from __future__ import annotations

import random
from typing import Any

from app.games import crossing_engine as eng
from app.games.base import TURN_BASED, BaseGame

# Bot search depth. The state is small but the branching factor (~12) is higher
# than Mancala's, so keep the lookahead modest to stay snappy under the room
# lock; Phase-5 tuning can deepen with a time budget if wanted.
AI_DEPTH = 3


class Crossing(BaseGame):
    type = "crossing"  # internal slug; the public name is decided separately
    name = "Crossing"
    tagline = "Race your three across. No jumping."
    total_rounds = 1
    mode = TURN_BASED
    solo_enabled = True
    listed = False  # unlisted while we test; flip to True (or drop this) to launch

    # ---- lifecycle ----
    def init_turn_state(self, player_ids: list[str]) -> dict[str, Any]:
        """Fresh board, chosen at random. player_ids[0] moves first and starts
        on the near side; player_ids[1] on the far side."""
        board = random.choice(eng.boards())
        state = eng.initial_state(board, sides=(player_ids[0], player_ids[1]))
        return eng.serialize(state)

    def apply_turn(
        self, state: dict[str, Any], player_id: str, action: dict[str, Any]
    ) -> dict[str, Any] | None:
        st = eng.deserialize(state)
        if st["turn"] != player_id or eng.is_over(st):
            return None
        try:
            mv = (int(action["from"]), int(action["to"]))
        except (KeyError, TypeError, ValueError):
            return None
        if not eng.is_legal_move(st, mv):
            return None
        return eng.serialize(eng.apply_move(st, mv))

    def turn_over(self, state: dict[str, Any]) -> bool:
        return state.get("winner") is not None or bool(state.get("draw"))

    def turn_scores(self, state: dict[str, Any]) -> dict[str, int]:
        """1 for the winner, 0 for the loser; equal (a draw) on repetition. The
        engine takes the higher score as the winner and equal as a draw, so a
        win/loss game rides the wins-first leaderboard with no invented score."""
        order = state["order"]
        w = state.get("winner")
        if not w:
            return {p: 0 for p in order}
        return {p: (1 if p == w else 0) for p in order}

    def turn_public(self, state: dict[str, Any]) -> dict[str, Any]:
        """The whole board is public (no hidden information). Includes the
        geometry so the client can render whichever board loaded, plus the legal
        destinations for the side to move so it can highlight them; the server
        stays authoritative regardless."""
        b = eng.BOARDS[state["board"]]
        st = eng.deserialize(state)
        return {
            "layout": state["board"],   # which of the boards loaded
            "nodes": b["pos"],          # {node: [x, y]}
            "edges": b["edges"],
            "occ": state["occ"],        # {node: player_id}
            "order": state["order"],
            "turn": state["turn"],
            "targets": state["tgt"],    # {player_id: [target nodes]}
            "moves": state["moves"],
            "winner": state.get("winner"),
            "draw": bool(state.get("draw")),
            "legal": [list(m) for m in eng.legal_moves(st)],
            "scores": self.turn_scores(state),
        }

    def ai_move(self, state: dict[str, Any], player_id: str) -> dict[str, Any] | None:
        st = eng.deserialize(state)
        if st["turn"] != player_id or eng.is_over(st):
            return None
        mv = eng.best_move(st, depth=AI_DEPTH)
        if mv is None:
            return None
        return {"from": mv[0], "to": mv[1]}

    # ---- results / share copy ----
    def _outcome(self, state: dict[str, Any]) -> str:
        """win / loss / draw from the solo human's perspective (order[0])."""
        w = state.get("winner")
        human = state["order"][0]
        if w == human:
            return "win"
        if w:
            return "loss"
        return "draw"

    def turn_metric(self, score: int, state: dict[str, Any]) -> str:
        return {"win": "beat the Caver", "loss": "lost to the Caver",
                "draw": "drew the Caver"}[self._outcome(state)]

    def solo_metric(self, score: int, game_state: dict[str, Any]) -> str:
        return self.turn_metric(score, game_state)
