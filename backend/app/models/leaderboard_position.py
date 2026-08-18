from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class LeaderboardPosition(Base):
    """A continuous spell in one of the top three leaderboard positions."""

    __tablename__ = "leaderboard_positions"
    __table_args__ = (
        UniqueConstraint(
            "game_type", "mode", "period", "rank", "started_at",
            name="uq_leaderboard_position_start",
        ),
        Index("ix_leaderboard_position_current", "game_type", "mode", "period", "ended_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    game_type: Mapped[str] = mapped_column(String(64))
    mode: Mapped[str] = mapped_column(String(16))
    period: Mapped[str] = mapped_column(String(16))
    rank: Mapped[int] = mapped_column(Integer)
    holder_did: Mapped[str] = mapped_column(String(255))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
