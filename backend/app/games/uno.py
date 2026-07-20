"""Uno — the first turn-based game with hidden state.

Every other turn game (Connect 4, Dots and Boxes, Tile Takeover) puts its whole
board on the table, so `turn_public` could return the state as-is. Uno deals
hands, so the state is split: `turn_public` carries only what everyone may see
(the discard top, the active colour, how many cards each player holds) and
`turn_private` hands each player their own cards. The deck order never leaves
the server at all — otherwise a client could read the next card.

Two-player rules, which differ from the table game in one place: **Reverse acts
as Skip**, since reversing direction between two people just returns the turn.

Deliberately left out of v1: stacking draw cards, challenging a Wild Draw Four,
and the penalty for failing to call "Uno". Each adds a decision point that needs
its own UI, and the game is complete and fair without them.
"""
from __future__ import annotations

import random
from typing import Any

from app.games.base import TURN_BASED, BaseGame

COLORS = ("r", "y", "g", "b")
SKIP, REV, DRAW2, WILD, WILD4 = "skip", "rev", "d2", "wild", "wd4"

# Classic Uno scoring for the cards left in the loser's hand.
ACTION_POINTS = 20
WILD_POINTS = 50

STARTING_HAND = 7


def build_deck() -> list[dict[str, Any]]:
    """A standard 108-card deck. Each card gets a unique id so a hand can name
    exactly which card is being played (there are two of most cards)."""
    cards: list[dict[str, Any]] = []

    def add(color: str, value: str) -> None:
        cards.append({"id": len(cards), "color": color, "value": value})

    for color in COLORS:
        add(color, "0")
        for v in "123456789":
            add(color, v)
            add(color, v)
        for v in (SKIP, REV, DRAW2):
            add(color, v)
            add(color, v)
    for _ in range(4):
        add("w", WILD)
        add("w", WILD4)
    return cards


def card_points(card: dict[str, Any]) -> int:
    v = card["value"]
    if v in (WILD, WILD4):
        return WILD_POINTS
    if v in (SKIP, REV, DRAW2):
        return ACTION_POINTS
    return int(v)


def is_playable(card: dict[str, Any], top: dict[str, Any], color: str) -> bool:
    """Wilds always go. Otherwise match the active colour or the face value.

    The active colour is tracked separately from the top card because a wild
    sets a colour the card itself doesn't carry.
    """
    if card["color"] == "w":
        return True
    return card["color"] == color or card["value"] == top["value"]


def _draw_from(state: dict[str, Any], n: int) -> list[dict[str, Any]]:
    """Take n cards, reshuffling the discard pile back in if the deck runs dry.

    The top card stays on the table; everything under it becomes the new deck.
    If both are exhausted (possible with pathological draw counts) we simply
    hand back fewer cards rather than dealing cards that don't exist.
    """
    out: list[dict[str, Any]] = []
    for _ in range(n):
        if not state["deck"]:
            if len(state["discard"]) <= 1:
                break
            top = state["discard"][-1]
            rest = state["discard"][:-1]
            random.shuffle(rest)
            state["deck"] = rest
            state["discard"] = [top]
        out.append(state["deck"].pop())
    return out


class Uno(BaseGame):
    type = "uno"
    name = "Uno"
    tagline = "Match colour or number. First to empty their hand wins."
    total_rounds = 1
    mode = TURN_BASED
    solo_enabled = True

    # ---- setup ----

    def init_turn_state(self, player_ids: list[str]) -> dict[str, Any]:
        a, b = player_ids[0], player_ids[1]
        deck = build_deck()
        random.shuffle(deck)
        hands = {a: [deck.pop() for _ in range(STARTING_HAND)],
                 b: [deck.pop() for _ in range(STARTING_HAND)]}

        # The opening card can't be a wild — nobody has chosen a colour yet — so
        # bury any wild back in the deck and turn the next one.
        while deck and deck[-1]["color"] == "w":
            deck.insert(0, deck.pop())
        top = deck.pop()

        state = {
            "order": [a, b],
            "turn": a,
            "hands": hands,
            "deck": deck,
            "discard": [top],
            "color": top["color"],
            "winner": None,
            "drawn": None,   # card just drawn; its owner may play it or pass
            "last": None,    # short description of the previous move, for the UI
        }
        # An opening action card applies to the first player, as at a real table.
        if top["value"] in (SKIP, REV):
            state["turn"] = b
            state["last"] = {"kind": "opening_skip"}
        elif top["value"] == DRAW2:
            hands[a].extend(_draw_from(state, 2))
            state["turn"] = b
            state["last"] = {"kind": "opening_draw2"}
        return state

    def _opponent(self, state: dict[str, Any], pid: str) -> str:
        a, b = state["order"]
        return b if pid == a else a

    # ---- moves ----

    def apply_turn(
        self, state: dict[str, Any], player_id: str, action: dict[str, Any]
    ) -> dict[str, Any] | None:
        if state["turn"] != player_id or state["winner"] is not None:
            return None

        kind = action.get("action")
        if kind == "play":
            return self._play(state, player_id, action)
        if kind == "draw":
            return self._draw(state, player_id)
        if kind == "pass":
            return self._pass(state, player_id)
        return None

    def _play(
        self, state: dict[str, Any], pid: str, action: dict[str, Any]
    ) -> dict[str, Any] | None:
        hand = state["hands"][pid]
        try:
            card_id = int(action.get("card_id"))
        except (TypeError, ValueError):
            return None
        card = next((c for c in hand if c["id"] == card_id), None)
        if card is None:
            return None  # not holding it
        # After drawing you may only play that card, or pass.
        if state["drawn"] is not None and state["drawn"]["id"] != card_id:
            return None
        if not is_playable(card, state["discard"][-1], state["color"]):
            return None

        new = self._clone(state)
        new_hand = [c for c in new["hands"][pid] if c["id"] != card_id]
        new["hands"][pid] = new_hand
        new["discard"] = new["discard"] + [card]
        new["drawn"] = None

        if card["color"] == "w":
            chosen = action.get("color")
            # A wild with no colour named would leave the game unplayable.
            new["color"] = chosen if chosen in COLORS else random.choice(COLORS)
        else:
            new["color"] = card["color"]

        opp = self._opponent(new, pid)
        if not new_hand:
            new["winner"] = pid
            new["turn"] = pid
            new["last"] = {"kind": "win", "by": pid, "card": card}
            return new

        # Skip and Reverse both mean "go again" with two players.
        if card["value"] in (SKIP, REV):
            new["turn"] = pid
            new["last"] = {"kind": "skip", "by": pid, "card": card}
        elif card["value"] == DRAW2:
            new["hands"][opp] = new["hands"][opp] + _draw_from(new, 2)
            new["turn"] = pid
            new["last"] = {"kind": "draw2", "by": pid, "card": card}
        elif card["value"] == WILD4:
            new["hands"][opp] = new["hands"][opp] + _draw_from(new, 4)
            new["turn"] = pid
            new["last"] = {"kind": "wild4", "by": pid, "card": card, "color": new["color"]}
        elif card["value"] == WILD:
            new["turn"] = opp
            new["last"] = {"kind": "wild", "by": pid, "card": card, "color": new["color"]}
        else:
            new["turn"] = opp
            new["last"] = {"kind": "play", "by": pid, "card": card}
        return new

    def _draw(self, state: dict[str, Any], pid: str) -> dict[str, Any] | None:
        if state["drawn"] is not None:
            return None  # already drew this turn
        new = self._clone(state)
        drawn = _draw_from(new, 1)
        if not drawn:
            # Nothing left to draw: pass rather than deadlock the game.
            new["turn"] = self._opponent(new, pid)
            new["last"] = {"kind": "deck_empty", "by": pid}
            return new
        card = drawn[0]
        new["hands"][pid] = new["hands"][pid] + [card]
        if is_playable(card, new["discard"][-1], new["color"]):
            # Stay on turn so they can choose to play it or keep it.
            new["drawn"] = card
            new["last"] = {"kind": "drew_playable", "by": pid}
        else:
            new["turn"] = self._opponent(new, pid)
            new["last"] = {"kind": "drew", "by": pid}
        return new

    def _pass(self, state: dict[str, Any], pid: str) -> dict[str, Any] | None:
        # Passing is only legal after drawing a card you've chosen not to play.
        if state["drawn"] is None:
            return None
        new = self._clone(state)
        new["drawn"] = None
        new["turn"] = self._opponent(new, pid)
        new["last"] = {"kind": "passed", "by": pid}
        return new

    @staticmethod
    def _clone(state: dict[str, Any]) -> dict[str, Any]:
        """Shallow copy with the mutable containers rebuilt, so the previous
        state is never mutated (the engine compares/persists both)."""
        return {
            **state,
            "hands": {p: list(h) for p, h in state["hands"].items()},
            "deck": list(state["deck"]),
            "discard": list(state["discard"]),
        }

    # ---- results ----

    def turn_over(self, state: dict[str, Any]) -> bool:
        return state["winner"] is not None

    def turn_scores(self, state: dict[str, Any]) -> dict[str, int]:
        """Winner takes the value of what the loser was left holding.

        The engine treats the higher score as the winner, so a clean win always
        outranks the loser's zero, and the number doubles as a margin.
        """
        w = state["winner"]
        if w is None:
            return {pid: 0 for pid in state["order"]}
        loser = self._opponent(state, w)
        return {w: sum(card_points(c) for c in state["hands"][loser]), loser: 0}

    # ---- views ----

    def turn_public(self, state: dict[str, Any]) -> dict[str, Any]:
        """Everything safe to broadcast. Never the hands, never the deck."""
        return {
            "order": state["order"],
            "turn": state["turn"],
            "top": state["discard"][-1],
            "color": state["color"],
            "counts": {pid: len(h) for pid, h in state["hands"].items()},
            "deck_left": len(state["deck"]),
            "winner": state["winner"],
            "must_play_or_pass": state["drawn"] is not None,
            "last": state["last"],
            "scores": self.turn_scores(state),
        }

    def turn_private(self, state: dict[str, Any], player_id: str) -> dict[str, Any] | None:
        hand = state["hands"].get(player_id)
        if hand is None:
            return None  # a spectator, or the AI
        top, color = state["discard"][-1], state["color"]
        drawn = state["drawn"]
        # Which cards this player may legally put down right now. Computed here
        # so the client renders the same rules the server enforces.
        if drawn is not None:
            playable = [drawn["id"]] if is_playable(drawn, top, color) else []
        else:
            playable = [c["id"] for c in hand if is_playable(c, top, color)]
        return {"hand": hand, "playable": playable, "drawn_id": drawn["id"] if drawn else None}

    def turn_metric(self, score: int, state: dict[str, Any]) -> str:
        return f"won by {score}" if score else "lost this one"

    def solo_metric(self, score: int, game_state: dict[str, Any]) -> str:
        return "beat the Caver" if score else "lost to the Caver"

    # ---- solo opponent ----

    def ai_move(self, state: dict[str, Any], player_id: str) -> dict[str, Any] | None:
        """Play if it can, otherwise draw.

        Preference order: shed the expensive cards first (Wild Draw Four, Wild,
        then actions), and among plain numbers play the highest. That both scores
        better and reads as competent rather than random.
        """
        hand = state["hands"].get(player_id, [])
        top, color = state["discard"][-1], state["color"]
        drawn = state["drawn"]

        candidates = (
            [drawn] if drawn is not None and is_playable(drawn, top, color)
            else [c for c in hand if is_playable(c, top, color)]
        )
        if not candidates:
            return {"action": "pass"} if drawn is not None else {"action": "draw"}

        def rank(card: dict[str, Any]) -> tuple[int, int]:
            v = card["value"]
            if v == WILD4:
                return (0, 0)
            if v == DRAW2:
                return (1, 0)
            if v in (SKIP, REV):
                return (2, 0)
            if v == WILD:
                return (3, 0)
            return (4, -int(v))

        best = sorted(candidates, key=rank)[0]
        move: dict[str, Any] = {"action": "play", "card_id": best["id"]}
        if best["color"] == "w":
            # Choose whichever colour it holds most of, so the follow-up is easy.
            counts = {c: 0 for c in COLORS}
            for card in hand:
                if card["color"] in counts:
                    counts[card["color"]] += 1
            move["color"] = max(counts, key=lambda c: counts[c])
        return move
