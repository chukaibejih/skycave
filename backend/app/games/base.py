"""Server-authoritative game framework.

Every game is a subclass of :class:`BaseGame`. The server owns all scoring;
clients only ever send raw actions (a tapped color, a typed country, a globe
coordinate) and the server decides what they're worth. Clients are never
trusted.

Two round-resolution modes:

  - ``race``         — the first player to submit a *correct* action wins the
                       round's point; wrong actions don't end the round.
                       (Color Clash, Flag Rush)
  - ``simultaneous`` — all players submit, then everyone is scored together;
                       the round resolves when everyone has acted or the timer
                       expires. (GeoGuess)

A round is split into *public* data (broadcast to clients in ROUND_START) and
*secret* data (the answer — held server-side, revealed only in ROUND_RESULT).
"""
from __future__ import annotations

from typing import Any

RACE = "race"
SIMULTANEOUS = "simultaneous"
TURN_BASED = "turn_based"


class BaseGame:
    type: str = ""
    name: str = ""
    tagline: str = ""
    total_rounds: int = 1
    round_time: float = 15.0  # seconds before the round auto-resolves
    # gap between ROUND_RESULT and the next ROUND_START, in seconds
    result_delay: float = 2.5
    mode: str = RACE
    points_per_round: int = 1

    # ---- single-player ----
    # Whether this game supports a solo mode (all six built games do).
    solo_enabled: bool = True
    # How solo plays out:
    #   "rounds" — same fixed-round flow as versus, just one player (GeoGuess)
    #   "timed"  — continuous beat-the-clock; a fresh prompt after each correct
    #              answer, count correct in `solo_duration`s (Color/Flag/Outline)
    #   "words"  — one prompt for the whole session; submit many answers that
    #              accumulate score (Word Duel)
    #   "ladder" — endless; each correct answer advances a level, one miss ends
    #              the run; score = levels cleared (Reaction Grid)
    solo_kind: str = "rounds"
    solo_duration: float = 60.0  # session length for "timed" / "words"
    # "timed" only: if True a wrong answer also advances to the next prompt
    # (one shot per prompt — no retry, no brute-forcing). If False, a miss just
    # flashes and the same prompt stays (player can retry or skip).
    solo_advance_on_miss: bool = False

    def solo_metric(self, score: int, game_state: dict[str, Any]) -> str:
        """Human-readable score line for the solo share post / results.

        e.g. GeoGuess -> "18,420 pts · 5 rounds". Higher score is always better.
        Overridden per game; the default is a bare point count.
        """
        return f"{score:,} pts"

    def solo_step_time(self, public: dict[str, Any]) -> float:
        """Per-step time limit for "ladder" solo (seconds). Default round_time."""
        return self.round_time

    def solo_word(self, letters: list[str], word: str) -> int:
        """Score a single submitted word for "words" solo (0 = invalid)."""
        return 0

    # ---- round generation ----
    def new_round(self, round_number: int) -> tuple[dict[str, Any], dict[str, Any]]:
        """Return ``(public_data, secret_data)`` for the given round."""
        raise NotImplementedError

    # ---- race mode ----
    def check(
        self, public: dict[str, Any], secret: dict[str, Any], action: dict[str, Any]
    ) -> bool:
        """Return True if ``action`` is a correct answer (race mode only)."""
        raise NotImplementedError

    # ---- simultaneous mode ----
    def resolve(
        self,
        public: dict[str, Any],
        secret: dict[str, Any],
        actions: dict[str, dict[str, Any]],
    ) -> dict[str, int]:
        """Return per-player points for the round (simultaneous mode only).

        ``actions`` maps player_id -> their submitted action (may be missing a
        player who timed out — score them 0).
        """
        raise NotImplementedError

    # ---- turn-based mode ----
    # Turn-based games (Tile Takeover) don't use rounds: there's one evolving
    # board and players alternate moves until it's full. State lives entirely in
    # `turn_state` on the game doc; there is no hidden secret. Solo plays the
    # same flow against a server-side AI (see `ai_move`).
    def init_turn_state(self, player_ids: list[str]) -> dict[str, Any]:
        """Fresh board. `player_ids[0]` moves first (order is [you, opponent])."""
        raise NotImplementedError

    def apply_turn(
        self, state: dict[str, Any], player_id: str, action: dict[str, Any]
    ) -> dict[str, Any] | None:
        """Apply a move; return the new state (with `turn` advanced) or None if
        the move is illegal / not this player's turn."""
        raise NotImplementedError

    def turn_public(self, state: dict[str, Any]) -> dict[str, Any]:
        """Client-facing board (turn-based games hide nothing)."""
        return state

    def turn_over(self, state: dict[str, Any]) -> bool:
        return False

    def turn_scores(self, state: dict[str, Any]) -> dict[str, int]:
        """Final per-player tally (e.g. tiles owned)."""
        return {}

    def ai_move(self, state: dict[str, Any], player_id: str) -> dict[str, Any] | None:
        """Solo only: choose a move for the AI opponent, or None if it can't."""
        return None

    def turn_metric(self, score: int, state: dict[str, Any]) -> str:
        """Solo results/share line for a turn-based game."""
        return f"{score} tiles"

    # ---- shared helpers ----
    def reveal(self, public: dict[str, Any], secret: dict[str, Any]) -> dict[str, Any]:
        """What to expose about the answer in ROUND_RESULT."""
        return secret

    def result_details(
        self,
        public: dict[str, Any],
        secret: dict[str, Any],
        actions: dict[str, dict[str, Any]],
        points: dict[str, int],
    ) -> dict[str, Any]:
        """Optional extra per-round detail for explaining the result."""
        return {}
