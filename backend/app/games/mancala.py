"""Mancala (Kalah) - sow seeds around the board, bank the most to win.

Turn-based (same engine as Connect 4 / Tile Takeover): one evolving board, two
players, no hidden state. Solo plays against a minimax server-side AI (the
Caver). Deterministic rules, zero data.

Board, 14 pits indexed 0-13, seeds sown counterclockwise (index order):

      12  11  10   9   8   7        <- player B's pits (order[1])
  13                          6     <- B's store (13, left) / A's store (6, right)
       0   1   2   3   4   5        <- player A's pits (order[0])

  - order[0] owns pits 0-5 and store 6; order[1] owns pits 7-12 and store 13.
  - Sowing runs 0->1->...->13->0, dropping one seed per pit, but a player always
    SKIPS the opponent's store.
  - Last seed in your own store: you move again.
  - Last seed in one of your own empty pits, with seeds facing it across the
    board: capture that seed plus the opposite pit into your store.
  - When either side empties, the other player sweeps their remaining seeds into
    their store, and the game is over. Most seeds banked wins.
"""
from __future__ import annotations

from typing import Any

from app.games.base import TURN_BASED, BaseGame

PITS_PER_SIDE = 6
SEEDS_PER_PIT = 4
TOTAL_PITS = 14  # 6 + store + 6 + store
STORE_A = 6
STORE_B = 13
AI_DEPTH = 8  # minimax lookahead for the Caver


def _own_pits(p: int) -> range:
    """The playing pits owned by player index p (0 or 1)."""
    return range(0, 6) if p == 0 else range(7, 13)


def _own_store(p: int) -> int:
    return STORE_A if p == 0 else STORE_B


def _opp_store(p: int) -> int:
    return STORE_B if p == 0 else STORE_A


def _initial_pits() -> list[int]:
    pits = [SEEDS_PER_PIT] * TOTAL_PITS
    pits[STORE_A] = 0
    pits[STORE_B] = 0
    return pits


def _side_empty(pits: list[int], p: int) -> bool:
    return all(pits[i] == 0 for i in _own_pits(p))


def _sweep(pits: list[int]) -> None:
    """End of game: each player banks whatever is left on their own side."""
    pits[STORE_A] += sum(pits[i] for i in _own_pits(0))
    pits[STORE_B] += sum(pits[i] for i in _own_pits(1))
    for i in _own_pits(0):
        pits[i] = 0
    for i in _own_pits(1):
        pits[i] = 0


def _sow(pits: list[int], p: int, pit: int):
    """Apply one move for player p sowing from `pit`.

    Returns ``(new_pits, info)`` where info carries what the UI needs to explain
    the move, or ``None`` if the move is illegal. Pure: does not mutate input.
    """
    if pit not in _own_pits(p) or pits[pit] == 0:
        return None
    pits = list(pits)
    seeds = pits[pit]
    pits[pit] = 0
    opp_store = _opp_store(p)
    i = pit
    while seeds > 0:
        i = (i + 1) % TOTAL_PITS
        if i == opp_store:
            continue  # never sow into the opponent's store
        pits[i] += 1
        seeds -= 1

    own_store = _own_store(p)
    extra = i == own_store
    captured: list[int] = []
    # Capture: last seed lands in a own-side pit that was empty (now holds 1),
    # and the pit across from it has seeds. Take both piles into your store.
    if not extra and i in _own_pits(p) and pits[i] == 1:
        opposite = 12 - i
        if pits[opposite] > 0:
            pits[own_store] += pits[opposite] + 1
            captured = [i, opposite]
            pits[opposite] = 0
            pits[i] = 0

    done = _side_empty(pits, 0) or _side_empty(pits, 1)
    if done:
        _sweep(pits)

    return pits, {"extra": extra, "done": done, "last": i, "captured": captured}


def _game_over(pits: list[int]) -> bool:
    return _side_empty(pits, 0) or _side_empty(pits, 1)


def _evaluate(pits: list[int], ai: int) -> int:
    """Heuristic at the depth cutoff: the banked lead, plus a light preference
    for keeping seeds on your own side where they stay yours."""
    opp = 1 - ai
    store_lead = pits[_own_store(ai)] - pits[_own_store(opp)]
    on_side = sum(pits[i] for i in _own_pits(ai)) - sum(pits[i] for i in _own_pits(opp))
    return store_lead * 2 + on_side


def _minimax(pits, ai, to_move, depth, alpha, beta):
    if depth == 0 or _game_over(pits):
        return _evaluate(pits, ai), None
    legal = [pit for pit in _own_pits(to_move) if pits[pit] > 0]
    if not legal:
        return _evaluate(pits, ai), None

    best = legal[0]
    if to_move == ai:  # maximizing
        value = -(10 ** 9)
        for pit in legal:
            child, info = _sow(pits, to_move, pit)
            # An extra turn keeps the same player to move.
            nxt = to_move if (info["extra"] and not info["done"]) else 1 - to_move
            v, _ = _minimax(child, ai, nxt, depth - 1, alpha, beta)
            if v > value:
                value, best = v, pit
            alpha = max(alpha, value)
            if alpha >= beta:
                break
    else:  # minimizing
        value = 10 ** 9
        for pit in legal:
            child, info = _sow(pits, to_move, pit)
            nxt = to_move if (info["extra"] and not info["done"]) else 1 - to_move
            v, _ = _minimax(child, ai, nxt, depth - 1, alpha, beta)
            if v < value:
                value, best = v, pit
            beta = min(beta, value)
            if alpha >= beta:
                break
    return value, best


class Mancala(BaseGame):
    type = "mancala"
    name = "Mancala"
    tagline = "Sow the seeds. Bank the most."
    total_rounds = 1
    mode = TURN_BASED
    solo_enabled = True

    def init_turn_state(self, player_ids: list[str]) -> dict[str, Any]:
        a, b = player_ids[0], player_ids[1]
        return {
            "pits": _initial_pits(),
            "order": [a, b],
            "turn": a,
            "moves": 0,
            "done": False,
            "winner": None,       # pid, or None for an unfinished game or a tie
            "last": None,         # index the last seed landed in
            "last_pit": None,     # pit the move was sown from
            "captured": [],       # [pit, opposite] on a capture, else []
            "extra": False,       # the last move earned another turn
        }

    def _pindex(self, state: dict[str, Any], pid: str) -> int:
        return 0 if state["order"][0] == pid else 1

    def _decide_winner(self, pits: list[int], order: list[str]) -> str | None:
        a, b = pits[STORE_A], pits[STORE_B]
        if a > b:
            return order[0]
        if b > a:
            return order[1]
        return None  # tie

    def apply_turn(self, state: dict[str, Any], player_id: str, action: dict[str, Any]) -> dict[str, Any] | None:
        if state["turn"] != player_id or state["done"]:
            return None
        try:
            pit = int(action.get("pit"))
        except (TypeError, ValueError):
            return None
        p = self._pindex(state, player_id)
        res = _sow(state["pits"], p, pit)
        if res is None:
            return None
        pits, info = res
        order = state["order"]
        keep_turn = info["extra"] and not info["done"]
        return {
            **state,
            "pits": pits,
            "turn": player_id if keep_turn else order[1 - p],
            "moves": state["moves"] + 1,
            "done": info["done"],
            "winner": self._decide_winner(pits, order) if info["done"] else None,
            "last": info["last"],
            "last_pit": pit,
            "captured": info["captured"],
            "extra": keep_turn,
        }

    def turn_over(self, state: dict[str, Any]) -> bool:
        return bool(state["done"])

    def turn_scores(self, state: dict[str, Any]) -> dict[str, int]:
        # Seeds banked in each store. The engine takes the higher as the winner
        # and equal stores as a draw, which is exactly Mancala's result.
        a, b = state["order"]
        return {a: state["pits"][STORE_A], b: state["pits"][STORE_B]}

    def turn_public(self, state: dict[str, Any]) -> dict[str, Any]:
        return {
            "pits": state["pits"],
            "order": state["order"],
            "turn": state["turn"],
            "done": state["done"],
            "winner": state["winner"],
            "last": state["last"],
            "last_pit": state["last_pit"],
            "captured": state["captured"],
            "extra": state["extra"],
            "stores": {"a": STORE_A, "b": STORE_B},
            "scores": self.turn_scores(state),
        }

    def turn_metric(self, score: int, state: dict[str, Any]) -> str:
        return f"banked {score}"

    def solo_metric(self, score: int, game_state: dict[str, Any]) -> str:
        # Every one of the 48 seeds is banked by game's end, so the Caver's total
        # is simply the rest. Name the scoreline, so the share post carries the
        # actual result instead of a bare "beat the Caver".
        total = PITS_PER_SIDE * SEEDS_PER_PIT * 2
        theirs = total - score
        if score > theirs:
            return f"beat the Caver {score}-{theirs}"
        if score < theirs:
            return f"lost to the Caver {score}-{theirs}"
        return f"tied the Caver {score}-{theirs}"

    def ai_move(self, state: dict[str, Any], player_id: str, difficulty: str = "normal") -> dict[str, Any] | None:
        p = self._pindex(state, player_id)
        legal = [pit for pit in _own_pits(p) if state["pits"][pit] > 0]
        if not legal:
            return None
        _, pit = _minimax(state["pits"], p, p, AI_DEPTH, -(10 ** 9), 10 ** 9)
        return {"pit": pit if pit is not None else legal[0]}
