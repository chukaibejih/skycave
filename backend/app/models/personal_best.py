from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PersonalBest(Base):
    """A player's best single-player score for one game.

    Keyed by (player_id, game_type). Only persisted for Bluesky users - guests
    have ephemeral ids, so their personal best lives in the browser (localStorage)
    instead. Higher score is always better (solo scoring is normalized that way:
    points for GeoGuess, count for the timed games, level for Reaction Grid).
    """

    __tablename__ = "personal_bests"
    # Solo leaderboard sort: top best_scores within a game.
    __table_args__ = (Index("ix_pb_game_score", "game_type", "best_score"),)

    player_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    game_type: Mapped[str] = mapped_column(String(64), primary_key=True)

    best_score: Mapped[int] = mapped_column(Integer, default=0)
    plays: Mapped[int] = mapped_column(Integer, default=0)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
