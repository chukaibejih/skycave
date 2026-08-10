"""Crossing engine rules — unit tests (pure, no DB/network).

Run:  python tests/crossing_rules.py     (from backend/)

Covers the spec's cases: initial state, movement legality (connected / no-jump /
occupied / opponent / wrong-turn / backward / sideways), winning (both sides,
partial), draw by threefold repetition (turn-aware), and the bot (legal, finds
an immediate win, pure, terminal-safe).
"""
import copy
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app", "games"))
import crossing_engine as eng  # noqa: E402


def mk(board, a_nodes, b_nodes, turn=eng.A):
    b = eng.BOARDS[board]
    occ = {n: eng.A for n in a_nodes}
    occ.update({n: eng.B for n in b_nodes})
    st = {"board": board, "occ": occ, "order": [eng.A, eng.B],
          "tgt": {eng.A: list(b["b"]), eng.B: list(b["a"])},
          "turn": turn, "moves": 0, "hist": {}, "winner": None, "draw": False}
    st["hist"][eng.normalize(st)] = 1
    return st


# --------------------------------------------------------------------------- #

def test_initial_state():
    for bid in eng.boards():
        st = eng.initial_state(bid)
        b = eng.BOARDS[bid]
        assert sorted(eng._nodes_of(st, eng.A)) == sorted(b["a"]), bid
        assert sorted(eng._nodes_of(st, eng.B)) == sorted(b["b"]), bid
        assert st["turn"] == eng.A, "A moves first"
        # A's target is B's start and vice-versa.
        assert eng.target_of(bid, eng.A) == b["b"]
        assert eng.target_of(bid, eng.B) == b["a"]
        assert not eng.is_over(st)
    print("initial state: 3v3 start, A to move, targets are the far side, on every board")


def test_movement():
    st = eng.initial_state(0)
    adj = eng._ADJ[0]

    # A legal connected move into an empty node is accepted and passes the turn.
    mv = eng.legal_moves(st)[0]
    frm, to = mv
    assert st["occ"][frm] == eng.A and to not in st["occ"]
    assert to in adj[frm]
    st2 = eng.apply_move(st, mv)
    assert st2["occ"].get(to) == eng.A and frm not in st2["occ"]
    assert st2["turn"] == eng.B

    # Disconnected move (non-adjacent) rejected.
    a_piece = eng._nodes_of(st, eng.A)[0]
    far = next(n for n in eng.BOARDS[0]["pos"] if n not in adj[a_piece] and n != a_piece and n not in st["occ"])
    assert not eng.is_legal_move(st, (a_piece, far))

    # Jumping / moving onto an occupied node rejected.
    occupied_nb = next((n for n in adj[a_piece] if n in st["occ"]), None)
    if occupied_nb is not None:
        assert not eng.is_legal_move(st, (a_piece, occupied_nb))

    # Opponent's piece cannot be moved, and a wrong-turn move is illegal.
    b_piece = eng._nodes_of(st, eng.B)[0]
    b_dest = next((n for n in adj[b_piece] if n not in st["occ"]), None)
    if b_dest is not None:
        assert not eng.is_legal_move(st, (b_piece, b_dest)), "A cannot move a B piece"
    # explicit wrong turn: same board, B to move, try to move an A piece
    st_bturn = dict(st, turn=eng.B)
    a_dest = next((n for n in adj[a_piece] if n not in st["occ"]), None)
    assert not eng.is_legal_move(st_bturn, (a_piece, a_dest))

    # Backward and sideways are legal where the graph allows: from a mid-board
    # piece, any empty neighbour is a legal move regardless of direction.
    mid = mk(0, [6, 0, 9], [4, 8, 13])  # A piece on central node 6
    dirs = [m for m in eng.legal_moves(mid) if m[0] == 6]
    assert len(dirs) >= 2, "a central piece should have moves in several directions"
    for _f, t in dirs:
        assert eng.is_legal_move(mid, (6, t))
    print("movement: connected ok; disconnected/jump/occupied/opponent/wrong-turn rejected; any-direction ok")


def test_winning():
    # A completes its target set (board 0 target = [4,8,13]) with one move.
    tA = eng.target_of(0, eng.A)
    third = tA[2]
    nb = next(n for n in eng._ADJ[0][third] if n not in tA)  # slide in from a non-target neighbour
    st = mk(0, [tA[0], tA[1], nb], [1, 2, 3], turn=eng.A)
    assert eng.check_winner(st) is None, "not won before the move"
    st2 = eng.apply_move(st, (nb, third))
    assert eng.check_winner(st2) == eng.A, "A wins on filling all three targets"

    # Partial occupation does not win.
    part = mk(0, [tA[0], tA[1], 6], [1, 2, 3], turn=eng.A)
    assert eng._winner_for(part, eng.A) is None

    # B wins in reverse (target = [0,5,9]).
    tB = eng.target_of(0, eng.B)
    nb2 = next(n for n in eng._ADJ[0][tB[2]] if n not in (tB[0], tB[1]))
    stb = mk(0, [1, 2, 3], [tB[0], tB[1], nb2], turn=eng.B)
    stb2 = eng.apply_move(stb, (nb2, tB[2]))
    assert eng.check_winner(stb2) == eng.B
    print("winning: A and B each win on full target occupation; partial does not")


def test_draw_repetition():
    st = eng.initial_state(0)
    adj = eng._ADJ[0]
    # An A shuttle and a B shuttle on disjoint nodes, so each is reversible.
    a_from = eng._nodes_of(st, eng.A)[0]
    a_to = next(n for n in adj[a_from] if n not in st["occ"])
    b_from = eng._nodes_of(st, eng.B)[0]
    b_to = next(n for n in adj[b_from] if n not in st["occ"] and n not in (a_from, a_to))
    assert len({a_from, a_to, b_from, b_to}) == 4

    drew = False
    for _ in range(6):
        for mv in [(a_from, a_to), (b_from, b_to), (a_to, a_from), (b_to, b_from)]:
            st = eng.apply_move(st, mv)
            if st["draw"]:
                drew = True
                break
        if drew:
            break
    assert drew, "threefold repetition of the same position must draw"

    # Repetition is turn-aware: same placement, different side to move -> distinct.
    s1 = mk(0, [0, 5, 9], [4, 8, 13], turn=eng.A)
    s2 = mk(0, [0, 5, 9], [4, 8, 13], turn=eng.B)
    assert eng.normalize(s1) != eng.normalize(s2)
    # Different placements are distinct (no false draw trigger).
    s3 = mk(0, [1, 5, 9], [4, 8, 13], turn=eng.A)
    assert eng.normalize(s1) != eng.normalize(s3)
    print("draw: threefold repetition draws; the key is turn-aware; distinct positions stay distinct")


def test_bot():
    st = eng.initial_state(0)
    # Always returns a legal move from a live position.
    mv = eng.best_move(st, depth=2)
    assert mv is not None and eng.is_legal_move(st, mv)

    # Recognises an immediate win.
    tA = eng.target_of(0, eng.A)
    nb = next(n for n in eng._ADJ[0][tA[2]] if n not in tA)
    win_st = mk(0, [tA[0], tA[1], nb], [1, 2, 3], turn=eng.A)
    before = copy.deepcopy(win_st)
    bmv = eng.best_move(win_st, depth=3)
    assert eng.apply_move(win_st, bmv)["winner"] == eng.A, "bot takes the winning move"
    # Pure: the search must not mutate its input.
    assert win_st == before, "best_move must not mutate the state"

    # Terminal-safe: a finished state offers no moves and no crash.
    done = eng.apply_move(mk(0, [tA[0], tA[1], nb], [1, 2, 3], turn=eng.A), (nb, tA[2]))
    assert eng.is_over(done) and eng.legal_moves(done) == []
    assert eng.best_move(done) is None
    print("bot: legal, finds an immediate win, pure (no mutation), terminal-safe")


def main():
    test_initial_state()
    test_movement()
    test_winning()
    test_draw_repetition()
    test_bot()
    print("\nPASS: Crossing engine rules verified")


if __name__ == "__main__":
    main()
