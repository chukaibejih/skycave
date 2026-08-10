"""Crossing: a pure graph-race engine, independent of Skycave presentation.

Three pieces per side slide one edge per turn into an EMPTY adjacent node (no
jumping, no landing on an occupied node). Backward and sideways moves are legal.
The first player to occupy all three of the opponent's start nodes wins. Because
backward moves allow endless shuffling, a threefold-repetition rule (plus a hard
move cap) declares a draw so a game is always finite.

Board-generic: a board is just {nodes, positions, edges, a_start, b_start}; one
of several loads at random per game. This module has NO app imports, so it runs
and is tested standalone; the Skycave BaseGame wrapper (crossing.py) maps real
player ids onto the two engine sides "A" and "B".

Engine surface (all pure, never mutate their inputs):
    boards()                       -> list of board ids
    initial_state(board_id)        -> state (A to move)
    legal_moves(state)             -> list[(frm, to)] for the side to move
    is_legal_move(state, mv)       -> bool
    apply_move(state, mv)          -> new state (turn advanced, winner/draw set)
    check_winner(state)            -> "A" | "B" | None
    check_draw(state)              -> bool
    is_over(state)                 -> bool
    normalize(state)               -> hashable canonical key (positions + turn)
    serialize(state)/deserialize   -> JSON-safe dict round-trip
"""
from __future__ import annotations

from collections import deque

# A game can never sanely need more than this many plies; the backstop that
# guarantees termination even if repetition detection is somehow evaded.
MOVE_CAP = 200
# Threefold repetition of the exact position (piece placement + side to move).
REPEAT_LIMIT = 3

A, B = "A", "B"
_OTHER = {A: B, B: A}


# --------------------------------------------------------------------------- #
# Boards
# --------------------------------------------------------------------------- #
# Each board: positions {node: (x, y)} in a 0..100 box (render only), an
# undirected edge list, and the two start triples. a_start is Player A's start
# and Player B's target; b_start is the reverse. Every board is mirror-symmetric
# (x -> 100-x maps A onto B) so neither side has a positional edge. Wide and
# triangulated on purpose: plenty of open nodes keeps movement free and draws
# rare (the concern with tight 9-node boards).

def _mesh(rows_xs):
    """Triangular lattice from N rows of x-positions (y spread evenly 20..80).

    Rows are wired horizontally, and each node is tied to its nearest one or two
    nodes in the row below, giving the triangulated, hand-drawn look of the
    physical boards. Returns (positions, edges).
    """
    R = len(rows_xs)
    ys = [50.0] if R == 1 else [round(20 + 60 * i / (R - 1), 1) for i in range(R)]
    pos, ids, n = {}, [], 0
    for xs, y in zip(rows_xs, ys):
        row = []
        for x in xs:
            pos[n] = (float(x), y)
            row.append(n)
            n += 1
        ids.append(row)
    edges = set()
    for row in ids:  # horizontal
        for a, b in zip(row, row[1:]):
            edges.add((a, b))
    for up, lo in zip(ids, ids[1:]):  # between adjacent rows
        for u in up:
            ux = pos[u][0]
            for l in sorted(lo, key=lambda l: abs(pos[l][0] - ux))[:2]:
                edges.add((min(u, l), max(u, l)))
    return pos, sorted(edges)


def _board(name, rows_xs):
    """A board from a mesh. The three left-most nodes are A's start (and B's
    target); the three right-most are B's. Every row layout here is left-right
    symmetric, so those two triples are exact mirrors and the game is fair."""
    pos, edges = _mesh(rows_xs)
    by_x = sorted(pos, key=lambda n: (pos[n][0], pos[n][1]))
    return {
        "name": name,
        "pos": {k: list(v) for k, v in pos.items()},
        "edges": [list(e) for e in edges],
        "a": sorted(by_x[:3]),
        "b": sorted(by_x[-3:]),
    }


# All five are wide, triangulated meshes: the family self-play proved plays
# cleanly (balanced, decisive, winnable both ways). They vary in size and shape
# so each feels distinct, matching the physical boards' triangulated look.
BOARDS = {
    0: _board("Lattice", [[10, 30, 50, 70, 90], [20, 40, 60, 80], [10, 30, 50, 70, 90]]),
    1: _board("Field", [[10, 30, 50, 70, 90], [10, 30, 50, 70, 90], [10, 30, 50, 70, 90]]),
    2: _board("Hex", [[20, 40, 60, 80], [8, 25, 42, 58, 75, 92], [20, 40, 60, 80]]),
    3: _board("Reach", [[15, 38, 62, 85], [10, 30, 50, 70, 90], [15, 38, 62, 85]]),
    4: _board("Wide", [[10, 26, 42, 58, 74, 90], [18, 34, 50, 66, 82], [10, 26, 42, 58, 74, 90]]),
}


def boards():
    return list(BOARDS)


def _adj(board_id):
    adj = {n: set() for n in BOARDS[board_id]["pos"]}
    for a, b in BOARDS[board_id]["edges"]:
        adj[a].add(b)
        adj[b].add(a)
    return {n: sorted(v) for n, v in adj.items()}


# adjacency + all-pairs distance, cached per board (read-only).
_ADJ = {bid: _adj(bid) for bid in BOARDS}


def _dist_from(board_id, src):
    adj = _ADJ[board_id]
    d = {src: 0}
    q = deque([src])
    while q:
        u = q.popleft()
        for v in adj[u]:
            if v not in d:
                d[v] = d[u] + 1
                q.append(v)
    return d


_DIST = {bid: {n: _dist_from(bid, n) for n in BOARDS[bid]["pos"]} for bid in BOARDS}


def target_of(board_id, side):
    """The nodes `side` must occupy to win (the opponent's start)."""
    return BOARDS[board_id]["b"] if side == A else BOARDS[board_id]["a"]


# --------------------------------------------------------------------------- #
# State
# --------------------------------------------------------------------------- #
# state = {
#   "board": int,
#   "occ":   {node(int): "A"|"B"},   # occupancy
#   "turn":  "A"|"B",                # side to move
#   "moves": int,
#   "hist":  {normkey(str): count},  # for threefold repetition
#   "winner": "A"|"B"|None,
#   "draw":  bool,
# }


def initial_state(board_id, sides=(A, B)):
    """Fresh board. `sides` are the two players (any hashable ids); sides[0]
    starts on a_start and moves first, sides[1] on b_start. Each side's target
    is the other's start, captured in the state so the engine never needs a
    global A/B convention and the Skycave wrapper can pass real player ids."""
    b = BOARDS[board_id]
    s0, s1 = sides
    occ = {}
    for n in b["a"]:
        occ[n] = s0
    for n in b["b"]:
        occ[n] = s1
    state = {"board": board_id, "occ": occ, "order": [s0, s1],
             "tgt": {s0: list(b["b"]), s1: list(b["a"])},
             "turn": s0, "moves": 0, "hist": {}, "winner": None, "draw": False}
    state["hist"][normalize(state)] = 1
    return state


def _nodes_of(state, side):
    return [n for n, s in state["occ"].items() if s == side]


def _other(state, side):
    o = state["order"]
    return o[0] if side == o[1] else o[1]


def normalize(state):
    """Canonical, hashable key: piece placements (order-independent per side)
    plus the side to move. Pieces are interchangeable within a side, so sorting
    the node ids makes logically identical positions compare equal."""
    s0, s1 = state["order"]
    a = ",".join(map(str, sorted(_nodes_of(state, s0))))
    b = ",".join(map(str, sorted(_nodes_of(state, s1))))
    return f"{a}|{b}|{state['turn']}"


def legal_moves(state):
    if state["winner"] is not None or state["draw"]:
        return []
    side = state["turn"]
    adj = _ADJ[state["board"]]
    occ = state["occ"]
    out = []
    for n in _nodes_of(state, side):
        for m in adj[n]:
            if m not in occ:
                out.append((n, m))
    return out


def is_legal_move(state, mv):
    return tuple(mv) in set(legal_moves(state))


def _winner_for(state, side):
    return side if set(_nodes_of(state, side)) == set(state["tgt"][side]) else None


def apply_move(state, mv):
    """Return a NEW state with `mv` applied. Raises ValueError if illegal, so
    callers that trust the client must catch (the Skycave wrapper returns None)."""
    if not is_legal_move(state, mv):
        raise ValueError(f"illegal move {mv}")
    frm, to = mv
    side = state["turn"]
    occ = dict(state["occ"])
    del occ[frm]
    occ[to] = side
    new = {
        "board": state["board"], "occ": occ, "order": list(state["order"]),
        "tgt": state["tgt"], "turn": _other(state, side),
        "moves": state["moves"] + 1, "hist": dict(state["hist"]),
        "winner": None, "draw": False,
    }
    # The mover wins the instant all their pieces sit on their targets.
    w = _winner_for(new, side)
    if w is not None:
        new["winner"] = w
        return new
    key = normalize(new)
    new["hist"][key] = new["hist"].get(key, 0) + 1
    if new["hist"][key] >= REPEAT_LIMIT or new["moves"] >= MOVE_CAP:
        new["draw"] = True
    return new


def check_winner(state):
    return state["winner"]


def check_draw(state):
    return state["draw"]


def is_over(state):
    return state["winner"] is not None or state["draw"]


def serialize(state):
    """JSON-safe: occ keys -> str, everything else already primitive."""
    return {
        "board": state["board"],
        "occ": {str(k): v for k, v in state["occ"].items()},
        "order": list(state["order"]),
        "tgt": {s: list(t) for s, t in state["tgt"].items()},
        "turn": state["turn"], "moves": state["moves"],
        "hist": state["hist"], "winner": state["winner"], "draw": state["draw"],
    }


def deserialize(doc):
    return {
        "board": doc["board"],
        "occ": {int(k): v for k, v in doc["occ"].items()},
        "order": list(doc["order"]),
        "tgt": {s: list(t) for s, t in doc["tgt"].items()},
        "turn": doc["turn"], "moves": doc["moves"],
        "hist": dict(doc.get("hist", {})), "winner": doc.get("winner"),
        "draw": doc.get("draw", False),
    }


# --------------------------------------------------------------------------- #
# Evaluation + search (shared by the bot and the self-play vetter)
# --------------------------------------------------------------------------- #

def _assign_distance(state, side):
    """Lower is better: greedily assign each of `side`'s pieces to a distinct
    target minimising graph distance, and sum. A cheap stand-in for the optimal
    assignment, enough to steer play toward the goal."""
    bid = state["board"]
    dist = _DIST[bid]
    pieces = _nodes_of(state, side)
    targets = list(state["tgt"][side])
    total = 0
    used = set()
    for p in sorted(pieces, key=lambda p: min(dist[p].get(t, 99) for t in targets)):
        best_t, best_d = None, 99
        for t in targets:
            if t in used:
                continue
            d = dist[p].get(t, 99)
            if d < best_d:
                best_d, best_t = d, t
        used.add(best_t)
        total += best_d
    return total


def evaluate(state, side):
    """Heuristic value of `state` for `side` (positive = good for side)."""
    if state["winner"] == side:
        return 10_000
    if state["winner"] == _other(state, side):
        return -10_000
    if state["draw"]:
        return 0
    me = _assign_distance(state, side)
    opp = _assign_distance(state, _other(state, side))
    home = sum(1 for n in _nodes_of(state, side) if n in state["tgt"][side])
    return (opp - me) * 4 + home * 6


def negamax(state, depth, alpha, beta):
    """Alpha-beta negamax from the perspective of state['turn']. Returns
    (score, best_move). Pure; never mutates state."""
    if is_over(state) or depth == 0:
        return evaluate(state, state["turn"]), None
    moves = legal_moves(state)
    if not moves:
        return evaluate(state, state["turn"]), None
    best, best_mv = -1_000_000, None
    for mv in moves:
        child = apply_move(state, mv)
        score = -negamax(child, depth - 1, -beta, -alpha)[0]
        if score > best:
            best, best_mv = score, mv
        alpha = max(alpha, score)
        if alpha >= beta:
            break
    return best, best_mv


def best_move(state, depth=3):
    return negamax(state, depth, -1_000_000, 1_000_000)[1]
