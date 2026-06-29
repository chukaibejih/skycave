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
    # Bluesky tone: lowercase, terse, reads like a person not a notification.
    return f"anyone want to run it? playing {game_name} rn\n\n{invite_url(room_id)}"


def scorecard_text(
    game_name: str,
    p1_handle: str,
    p1_score: int,
    p2_handle: str,
    p2_score: int,
    room_id: str,
    when: date | None = None,
) -> str:
    when = when or date.today()
    # e.g. "GeoGuess 1v1 · Jun 27"
    header = f"{game_name} · {when.strftime('%b %-d')}"
    # Align the two score lines on a simple column.
    width = max(len(p1_handle), len(p2_handle)) + 3
    body = (
        f"{p1_handle.ljust(width)}{p1_score}\n"
        f"{p2_handle.ljust(width)}{p2_score}"
    )
    return f"{header}\n\n{body}\n\n{results_url(room_id)}"
