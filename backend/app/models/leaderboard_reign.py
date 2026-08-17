from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class LeaderboardReign(Base):
    """A continuous spell holding #1 on a solo leaderboard.

    A reign opens when a player takes the top solo ``best_score`` for a game and
    closes (``ended_at`` set) the moment someone overtakes them. The one open
    reign per game is the row with ``ended_at IS NULL``. Its duration
    (``(ended_at or now) - started_at``) powers the Hall of Fame "longest reign"
    record.

    Reconciled at solo personal-best write time (see ``services.reigns``), so
    there is no polling: a reign can only change when a new best is stored, and
    that is exactly when reconcile runs.
    """

    __tablename__ = "leaderboard_reigns"
    __table_args__ = (
        # The hot lookup: the current (open) reign for a game.
        Index("ix_reign_game_open", "game_type", "ended_at"),
        Index("ix_reign_started", "started_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    game_type: Mapped[str] = mapped_column(String(64))
    holder_did: Mapped[str] = mapped_column(String(255))
    best_score: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    # Null while the reign is current; set to the overtake moment when it ends.
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
