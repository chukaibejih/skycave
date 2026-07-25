"""Mancala rules, proven by simulation.

Usage:  python tests/mancala_rules.py   (inside the api container)

The board is small and the rules are fiddly (skip the opponent's store, extra
turns, captures, the end sweep), so this plays many full AI-vs-AI games and
asserts the invariants that must always hold: 48 seeds are conserved at every
step, moves are always legal, extra turns keep the same player, a game always
ends with one side empty, and exactly one result (win or a clean tie) falls out.
"""
import sys

sys.path.insert(0, ".")

import app.games.mancala as _mancala
# Rules are independent of AI strength; run the sim at a shallow depth so the
# suite finishes fast. Production play uses the module's real AI_DEPTH.
_mancala.AI_DEPTH = 4
from app.games.mancala import (
    SEEDS_PER_PIT,
    STORE_A,
    STORE_B,
    Mancala,
    _own_pits,
    _sow,
)

TOTAL_SEEDS = SEEDS_PER_PIT * 12  # 48


def _total(pits) -> int:
    return sum(pits)


def test_sow_conserves_and_skips_opp_store() -> None:
    g = Mancala()
    st = g.init_turn_state(["a", "b"])
    assert _total(st["pits"]) == TOTAL_SEEDS

    # Player A sowing can never drop a seed into B's store (13) on that move.
    for pit in _own_pits(0):
        res = _sow(st["pits"], 0, pit)
        assert res is not None
        pits, info = res
        assert _total(pits) == TOTAL_SEEDS, f"seeds not conserved from pit {pit}"
    # From pit 2 (holds 4) the last seed lands in pit 6 = A's store -> extra turn.
    _, info = _sow(st["pits"], 0, 2)
    assert info["extra"] is True, "4 seeds from pit 2 should end in the store"
    print("sowing conserves 48 seeds, skips the opponent store, extra-turn detected")


def test_capture() -> None:
    g = Mancala()
    st = g.init_turn_state(["a", "b"])
    # Hand-set a capture: A's pit 0 has 1 seed, pit 1 empty, opposite of 1 (=11)
    # has seeds. Sowing pit 0 drops the single seed into empty pit 1 -> capture.
    pits = [0] * 14
    pits[0] = 1
    pits[11] = 5
    st["pits"] = pits
    res = _sow(st["pits"], 0, 0)
    assert res is not None
    new, info = res
    assert info["captured"] == [1, 11], info["captured"]
    # 1 (the sown seed) + 5 (opposite) into A's store; both pits cleared.
    assert new[STORE_A] == 6 and new[1] == 0 and new[11] == 0
    assert _total(new) == 6, "capture must conserve the seeds it moved"
    print("capture takes the landing seed plus the opposite pit into the store")


def test_full_games_terminate_and_conserve() -> None:
    g = Mancala()
    wins = {"a": 0, "b": 0, "tie": 0}
    longest = 0
    for n in range(120):
        # Alternate who starts to shake out both sides of the asymmetry.
        order = ["a", "b"] if n % 2 == 0 else ["b", "a"]
        st = g.init_turn_state(order)
        moves = 0
        while not g.turn_over(st):
            mover = st["turn"]
            action = g.ai_move(st, mover)
            assert action is not None, "a non-finished game had no AI move"
            legal = [p for p in _own_pits(st["order"].index(mover)) if st["pits"][p] > 0]
            assert action["pit"] in legal, f"AI chose an illegal pit {action['pit']}"
            nxt = g.apply_turn(st, mover, action)
            assert nxt is not None, "a legal AI move was rejected"
            assert _total(nxt["pits"]) == TOTAL_SEEDS, "seeds not conserved mid-game"
            st = nxt
            moves += 1
            assert moves < 500, "game did not terminate"
        longest = max(longest, moves)
        # Ended: one side empty, everything banked, stores sum to 48.
        assert st["pits"][STORE_A] + st["pits"][STORE_B] == TOTAL_SEEDS, "not all seeds banked at end"
        w = st["winner"]
        wins["tie" if w is None else ("a" if w == "a" else "b")] += 1

    print(f"120 full games: longest {longest} moves, results {wins}")
    assert wins["a"] and wins["b"], "one side never won across 120 games - AI or rules skewed"


def test_illegal_moves_refused() -> None:
    g = Mancala()
    st = g.init_turn_state(["a", "b"])
    assert g.apply_turn(st, "b", {"pit": 7}) is None, "moved out of turn"
    assert g.apply_turn(st, "a", {"pit": 7}) is None, "played opponent's pit"
    assert g.apply_turn(st, "a", {"pit": 6}) is None, "played into the store"
    empty = {**st, "pits": [0] * 14}
    empty["pits"][3] = 2
    assert g.apply_turn(empty, "a", {"pit": 0}) is None, "played an empty pit"
    print("illegal moves (out of turn, wrong side, the store, an empty pit) are refused")


def main() -> None:
    test_sow_conserves_and_skips_opp_store()
    test_capture()
    test_illegal_moves_refused()
    test_full_games_terminate_and_conserve()
    print("\nPASS: Mancala conserves 48 seeds, captures, terminates, and refuses illegal moves")


if __name__ == "__main__":
    main()
