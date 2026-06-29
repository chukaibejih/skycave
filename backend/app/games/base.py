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
