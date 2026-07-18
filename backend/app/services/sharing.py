"""Bluesky share text + compose-intent URL builders.

Score-card image generation (R2/Playwright) is Phase 2. For the MVP we return
copyable plain text plus a pre-filled bsky.app compose intent — which reads
naturally in a feed and works today.
"""
from __future__ import annotations

from datetime import date
from urllib.parse import quote

from app.core.config import settings

BSKY_COMPOSE = "https://bsky.app/intent/compose"


def invite_url(room_id: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}/room/{room_id}"


def results_url(room_id: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}/results/{room_id}"


def compose_intent(text: str) -> str:
    return f"{BSKY_COMPOSE}?text={quote(text)}"


def invite_text(game_name: str, room_id: str) -> str:
    # Give the reader context: what it is + that they can just tap in. Casual
    # tone so it still reads like a person, not a notification.
    return (
        f"come play me in {game_name} on Skycave. tap the link to jump straight "
        f"in, no account needed:\n\n{invite_url(room_id)}"
    )


def scorecard_text(
    game_name: str,
    p1_handle: str,
    p1_score: int,
    p2_handle: str,
    p2_score: int,
    room_id: str,
    when: date | None = None,
    p1_series: int = 0,
    p2_series: int = 0,
) -> str:
    when = when or date.today()
    # A rematch series (more than one decided game in the room): post the running
    # aggregate, not just the last game.
    series_total = p1_series + p2_series
    if series_total > 1:
        header = f"{game_name} on Skycave · series"
        a, b = p1_series, p2_series
    else:
        # e.g. "GeoGuess 1v1 on Skycave · Jun 27"
        header = f"{game_name} on Skycave · {when.strftime('%b %-d')}"
        a, b = p1_score, p2_score
    # Align the two score lines on a simple column.
    width = max(len(p1_handle), len(p2_handle)) + 3
    body = f"{p1_handle.ljust(width)}{a}\n{p2_handle.ljust(width)}{b}"
    return f"{header}\n\n{body}\n\nyour turn:\n{results_url(room_id)}"
