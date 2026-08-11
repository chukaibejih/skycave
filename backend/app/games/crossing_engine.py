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

import math
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


def _knn(pos, k=4):
    """Undirected edges connecting each node to its k nearest neighbours. Auto-
    triangulates any point layout, so a board is defined purely by its shape."""
    ids = list(pos)
    edges = set()
    for a in ids:
        near = sorted((math.dist(tuple(pos[a]), tuple(pos[b])), b) for b in ids if b != a)
        for _, b in near[:k]:
            edges.add((min(a, b), max(a, b)))
    return sorted(edges)


def _rows(cols):
    return [(x, y) for x, ys in cols for y in ys]


def _shape(name, points, k=4):
    """A board from an arbitrary point cloud (an outline), wired by _knn. The
    three left-most nodes are A's start, the three right-most B's; every layout
    is mirror-symmetric about x=50, so those triples are exact mirrors."""
    pos = {i: [float(x), float(y)] for i, (x, y) in enumerate(points)}
    by_x = sorted(pos, key=lambda n: (pos[n][0], pos[n][1]))
    return {"name": name, "pos": pos, "edges": [list(e) for e in _knn(pos, k)],
            "a": sorted(by_x[:3]), "b": sorted(by_x[-3:])}


def _wire(name, points, edges):
    """A board with hand-placed nodes and an EXPLICIT edge list (unlike _shape's
    nearest-neighbour wiring). For deliberate topologies - forks, lanes - where
    auto-wiring would blur the intended shape. Three left-most nodes are A's
    start, three right-most B's; keep the layout mirror-symmetric about x=50 so
    the two triples are exact mirrors and neither side has a positional edge."""
    pos = {i: [float(x), float(y)] for i, (x, y) in enumerate(points)}
    by_x = sorted(pos, key=lambda n: (pos[n][0], pos[n][1]))
    return {"name": name, "pos": pos,
            "edges": [[int(a), int(b)] for a, b in edges],
            "a": sorted(by_x[:3]), "b": sorted(by_x[-3:])}


# Forks: two three-tooth combs facing each other, joined through a central
# two-lane diamond (the crossing lines in the reference board). The teeth are the
# start/target triples; pieces funnel down a comb's spine, cross the middle, and
# climb the far comb. Hand-wired so the fork shape stays crisp.
_FORK_PTS = [
    (10, 22), (10, 50), (10, 78),   # 0,1,2   A teeth (left tips)
    (32, 22), (32, 50), (32, 78),   # 3,4,5   left spine / tooth bases
    (50, 36), (50, 64),             # 6,7     centre lanes
    (68, 22), (68, 50), (68, 78),   # 8,9,10  right spine / tooth bases
    (90, 22), (90, 50), (90, 78),   # 11,12,13 B teeth (right tips)
]
_FORK_EDGES = [
    (0, 3), (1, 4), (2, 5),                 # left teeth
    (3, 4), (4, 5),                         # left spine
    (3, 6), (4, 6), (4, 7), (5, 7),         # left -> centre (crossing)
    (6, 7),                                 # lane link
    (8, 6), (9, 6), (9, 7), (10, 7),        # centre -> right (crossing)
    (8, 9), (9, 10),                        # right spine
    (11, 8), (12, 9), (13, 10),             # right teeth
]

# Three deliberately DIFFERENT boards, each self-play vetted (balanced, decisive,
# draws rare). Board 0 stays the rectangular lattice (the unit tests pin its node
# ids); the others are a pointed chevron and the hand-wired forks - purpose-built
# shapes with real breathing room, so no two boards read the same.
BOARDS = {
    0: _board("Lattice", [[10, 30, 50, 70, 90], [20, 40, 60, 80], [10, 30, 50, 70, 90]]),
    1: _shape("Chevron", _rows([(10, [35, 65]), (30, [25, 50, 75]), (50, [15, 40, 60, 85]),
                               (70, [25, 50, 75]), (90, [35, 65])]), k=3),
    2: _wire("Forks", _FORK_PTS, _FORK_EDGES),
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


def _progress(state, side):
    """How far `side` has advanced: (pieces home, -total graph-distance to home).
    Higher is better. Distances use the empty-board graph (ignore blocking), which
    is all we need to rank who advanced further. Used to settle a game that ended
    without anyone completing (repetition / move-cap / stalemate)."""
    bid = state["board"]
    tgt = state["tgt"][side]
    tset = set(tgt)
    home = 0
    dist = 0
    for n, p in state["occ"].items():
        if p != side:
            continue
        if n in tset:
            home += 1
        else:
            dist += min(_DIST[bid][n][t] for t in tgt)
    return (home, -dist)


def _settle(state):
    """Decide a non-completed game by progress: the side that advanced further
    wins; a genuine tie stays a draw. Returns the winning side id, or None."""
    a, b = state["order"]
    pa, pb = _progress(state, a), _progress(state, b)
    if pa > pb:
        return a
    if pb > pa:
        return b
    return None


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
    # A game that ends without a completion - threefold repetition, the move cap,
    # or the side-to-move stalemated (all three pieces boxed in) - is settled by
    # progress rather than called a draw outright: whoever advanced further wins,
    # only a dead-even position is a true draw. Without this these standoffs (very
    # common vs a perfect blocker) drew far too often.
    if (new["hist"][key] >= REPEAT_LIMIT or new["moves"] >= MOVE_CAP
            or not legal_moves(new)):
        w = _settle(new)
        if w is not None:
            new["winner"] = w
        else:
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
