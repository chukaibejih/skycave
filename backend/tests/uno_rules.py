"""Uno rules check — pure logic, no server needed.

Usage:  python tests/uno_rules.py

Uno is the first game here with hidden state and an unbounded turn count, so the
things worth proving are that it always terminates, never leaks a hand, and
never creates or loses a card.
"""
import random
import sys
from collections import Counter

sys.path.insert(0, ".")

from app.games.uno import COLORS, DRAW2, REV, SKIP, WILD, WILD4, Uno, build_deck

game = Uno()
A, B = "player-a", "player-b"


def check_deck() -> None:
    deck = build_deck()
    assert len(deck) == 108, f"deck should be 108 cards, got {len(deck)}"
    assert len({c["id"] for c in deck}) == 108, "card ids must be unique"
    by_value = Counter(c["value"] for c in deck)
    assert by_value["0"] == 4, by_value["0"]
    assert by_value["7"] == 8, by_value["7"]
    assert by_value[SKIP] == by_value[REV] == by_value[DRAW2] == 8
    assert by_value[WILD] == by_value[WILD4] == 4
    print(f"deck: 108 cards, unique ids, correct composition")


def _cards_in(node) -> list:
    """Every card-shaped dict anywhere inside a payload, however nested."""
    found = []
    if isinstance(node, dict):
        if {"id", "color", "value"} <= node.keys():
            found.append(node)
        for v in node.values():
            found += _cards_in(v)
    elif isinstance(node, list):
        for v in node:
            found += _cards_in(v)
    return found


def all_cards(state) -> list:
    """Every card in the game, wherever it currently sits."""
    out = list(state["deck"]) + list(state["discard"])
    for hand in state["hands"].values():
        out += hand
    return out


def play_one_game(seed: int):
    random.seed(seed)
    state = game.init_turn_state([A, B])
    turns = 0
    while not game.turn_over(state) and turns < 4000:
        mover = state["turn"]
        move = game.ai_move(state, mover)
        assert move is not None, "AI must always have a legal move available"
        nxt = game.apply_turn(state, mover, move)
        assert nxt is not None, f"AI produced an illegal move: {move}"

        # Conservation: cards are never created or destroyed.
        ids = [c["id"] for c in all_cards(nxt)]
        assert len(ids) == 108, f"card count drifted to {len(ids)}"
        assert len(set(ids)) == 108, "a card got duplicated"

        # The broadcast view must never carry hands or deck order. Compared by
        # card id rather than by string, or id 5 matches inside id 55.
        pub = game.turn_public(nxt)
        assert "hands" not in pub and "deck" not in pub
        exposed = {c["id"] for c in _cards_in(pub)}
        held = {c["id"] for c in nxt["hands"][A] + nxt["hands"][B]}
        assert not (exposed & held), (
            f"hand card(s) {exposed & held} leaked into the public view"
        )

        state = nxt
        turns += 1
    return state, turns


def check_games(n: int = 300) -> None:
    longest = 0
    winners = Counter()
    for seed in range(n):
        state, turns = play_one_game(seed)
        assert game.turn_over(state), f"seed {seed} did not finish in {turns} turns"
        assert state["winner"] in (A, B)
        # The winner is the one who emptied their hand.
        assert not state["hands"][state["winner"]]
        scores = game.turn_scores(state)
        assert scores[state["winner"]] >= scores[game._opponent(state, state["winner"])]
        longest = max(longest, turns)
        winners[state["winner"]] += 1
    print(f"{n} full games: all terminated, longest {longest} turns, "
          f"winners {winners[A]}/{winners[B]}")


def check_privacy() -> None:
    random.seed(7)
    state = game.init_turn_state([A, B])
    a_view = game.turn_private(state, A)
    b_view = game.turn_private(state, B)
    a_ids = {c["id"] for c in a_view["hand"]}
    b_ids = {c["id"] for c in b_view["hand"]}
    assert a_ids and b_ids and not (a_ids & b_ids), "hands overlap"
    assert game.turn_private(state, "somebody-else") is None, "non-player got a hand"
    assert set(a_view["playable"]) <= a_ids, "playable ids must come from the hand"
    print("privacy: each player sees only their own hand; non-players see nothing")


def check_illegal_moves() -> None:
    random.seed(3)
    state = game.init_turn_state([A, B])
    mover = state["turn"]
    other = game._opponent(state, mover)

    assert game.apply_turn(state, other, {"action": "draw"}) is None, "played out of turn"
    assert game.apply_turn(state, mover, {"action": "nonsense"}) is None
    assert game.apply_turn(state, mover, {"action": "play", "card_id": 9999}) is None, (
        "played a card not in hand"
    )
    assert game.apply_turn(state, mover, {"action": "pass"}) is None, (
        "passed without drawing first"
    )

    # A card that matches neither colour nor value must be refused.
    top, color = state["discard"][-1], state["color"]
    bad = next(
        (c for c in state["hands"][mover]
         if c["color"] != "w" and c["color"] != color and c["value"] != top["value"]),
        None,
    )
    if bad is not None:
        assert game.apply_turn(state, mover, {"action": "play", "card_id": bad["id"]}) is None, (
            "an unplayable card was accepted"
        )
    print("illegal moves: out-of-turn, unknown card, bad match, and early pass all refused")


def check_wild_always_sets_a_colour() -> None:
    """A wild played without naming a colour must not leave the game colourless."""
    random.seed(11)
    state = game.init_turn_state([A, B])
    mover = state["turn"]
    wild = {"id": 999, "color": "w", "value": WILD}
    state["hands"][mover] = state["hands"][mover] + [wild]
    nxt = game.apply_turn(state, mover, {"action": "play", "card_id": 999})
    assert nxt is not None and nxt["color"] in COLORS, nxt["color"] if nxt else None
    print("wilds: a colour is always set, even if the client omits one")


if __name__ == "__main__":
    check_deck()
    check_privacy()
    check_illegal_moves()
    check_wild_always_sets_a_colour()
    check_games()
    print("\nPASS: Uno rules verified")
