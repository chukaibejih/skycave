"""Dots and Boxes board check - pure logic, no server needed.

Usage:  python tests/dots_boxes_rules.py

The board was 4x5 = 20 boxes, an even count, so 10-10 was a natural result and
the game drew about half the time. That is fatal in a best-of-3 tournament
series, where a draw triggers a replay. This proves the 5x5 board can never
draw, that games still terminate, and that the AI still plays it.
"""
import random
import sys
from collections import Counter

sys.path.insert(0, ".")

from app.games.dots_boxes import COLS, ROWS, DotsAndBoxes

game = DotsAndBoxes()
A, B = "player-a", "player-b"


def play(seed: int):
    random.seed(seed)
    state = game.init_turn_state([A, B])
    turns = 0
    while not game.turn_over(state) and turns < 400:
        mover = state["turn"]
        move = game.ai_move(state, mover)
        assert move is not None, f"AI had no legal move on seed {seed}"
        nxt = game.apply_turn(state, mover, move)
        assert nxt is not None, f"AI produced an illegal move on seed {seed}: {move}"
        state = nxt
        turns += 1
    return state, turns


def main() -> None:
    total = COLS * ROWS
    print(f"board: {COLS}x{ROWS} = {total} boxes ({'odd' if total % 2 else 'EVEN'})")
    assert total % 2 == 1, "an even box count allows a tie; the board must be odd"

    draws = 0
    longest = 0
    winners = Counter()
    n = 400
    for seed in range(n):
        state, turns = play(seed)
        assert game.turn_over(state), f"seed {seed} did not finish in {turns} turns"
        scores = game.turn_scores(state)
        a, b = scores[A], scores[B]
        assert a + b == total, f"seed {seed}: boxes {a}+{b} != {total}"
        if a == b:
            draws += 1
        winners[A if a > b else B] += 1
        longest = max(longest, turns)

    print(f"{n} full games: longest {longest} turns, winners {winners[A]}/{winners[B]}")
    print(f"draws: {draws}")
    assert draws == 0, f"{draws} draws on an odd board should be impossible"
    print("\nPASS: 5x5 cannot draw, games terminate, AI plays it")


if __name__ == "__main__":
    main()
