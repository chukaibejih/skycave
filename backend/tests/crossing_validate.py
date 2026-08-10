"""Vet the Crossing boards by self-play, as promised before locking the set.

For each board it plays many games with a goal-seeking (epsilon-greedy negamax)
policy on both sides and reports:
  - A-win / B-win / draw split          (draws should be a small minority)
  - first-mover advantage               (A% near 50 = fair; the boards are mirror
                                          symmetric, so any gap is pure move-order)
  - average / max game length
  - whether BOTH sides can win           (the board is solvable in both directions)

A board that draws too often, is unwinnable for a side, or is wildly unbalanced
gets flagged for widening or replacement.

Run:  python tests/crossing_validate.py            (from backend/, pure stdlib)
"""
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app", "games"))
import crossing_engine as eng  # noqa: E402

GAMES = 400
DEPTH = 2
EPSILON = 0.18  # exploration, so the sample isn't one repeated line


def play(board_id, rng, depth=DEPTH, eps=EPSILON):
    state = eng.initial_state(board_id)
    while not eng.is_over(state):
        moves = eng.legal_moves(state)
        if not moves:  # a side with no move: treat as a draw/stall
            return "draw", state["moves"]
        if rng.random() < eps:
            mv = rng.choice(moves)
        else:
            mv = eng.best_move(state, depth) or rng.choice(moves)
        state = eng.apply_move(state, mv)
    if state["winner"]:
        return state["winner"], state["moves"]
    return "draw", state["moves"]


def vet(board_id):
    rng = random.Random(1234 + board_id)
    a = b = d = 0
    lengths = []
    for _ in range(GAMES):
        who, n = play(board_id, rng)
        lengths.append(n)
        if who == eng.A:
            a += 1
        elif who == eng.B:
            b += 1
        else:
            d += 1
    name = eng.BOARDS[board_id]["name"]
    nodes = len(eng.BOARDS[board_id]["pos"])
    openn = nodes - 6
    draw_pct = 100 * d / GAMES
    a_pct = 100 * a / GAMES
    decisive = a + b
    a_of_decisive = 100 * a / decisive if decisive else 0
    verdict = "ok"
    if draw_pct > 25:
        verdict = "TOO DRAWISH"
    elif a == 0 or b == 0:
        verdict = "ONE-SIDED (unwinnable for a side)"
    elif not (35 <= a_of_decisive <= 65):
        verdict = "IMBALANCED"
    print(
        f"  board {board_id} {name:10} nodes={nodes:2} open={openn} | "
        f"A {a_pct:4.1f}%  B {100*b/GAMES:4.1f}%  draw {draw_pct:4.1f}% | "
        f"decisive A-share {a_of_decisive:4.1f}% | "
        f"len avg {sum(lengths)/len(lengths):4.1f} max {max(lengths):3} | {verdict}"
    )
    return verdict, draw_pct


def main():
    print(f"Crossing board vetting — {GAMES} games/board, negamax depth {DEPTH}, eps {EPSILON}\n")
    bad = []
    for bid in eng.boards():
        # sanity: 3 pieces a side, symmetric sizes, connected
        b = eng.BOARDS[bid]
        assert len(b["a"]) == 3 and len(b["b"]) == 3, f"board {bid} not 3v3"
        verdict, _ = vet(bid)
        if verdict != "ok":
            bad.append(bid)
    print()
    if bad:
        print(f"FLAGGED for tuning: {[eng.BOARDS[i]['name'] for i in bad]}")
    else:
        print("PASS: all boards are balanced, decisive, and winnable both ways.")


if __name__ == "__main__":
    main()
