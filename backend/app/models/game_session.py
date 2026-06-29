from datetime import datetime

from sqlalchemy import JSON, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class GameSession(Base):
    """A completed game, persisted for history, stats and score cards.

    Written once when a game ends (GAME_END). Player ids are stored as plain
    strings (DID or guest id) rather than FKs because one side may be a guest
    with no User row.
    """

    __tablename__ = "game_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id: Mapped[str] = mapped_column(String(16), index=True)
    game_type: Mapped[str] = mapped_column(String(64), index=True)

    player1_id: Mapped[str] = mapped_column(String(255), index=True)
    player1_handle: Mapped[str] = mapped_column(String(255))
    player2_id: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    player2_handle: Mapped[str | None] = mapped_column(String(255), nullable=True)

    player1_score: Mapped[int] = mapped_column(Integer, default=0)
    player2_score: Mapped[int] = mapped_column(Integer, default=0)

    # Winner id (DID/guest id), or NULL on a draw.
    winner_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Per-round breakdown for the score card, e.g.
    # [{"round": 1, "p1": 95, "p2": 61}, ...]
    rounds: Mapped[list] = mapped_column(JSON, default=list)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
