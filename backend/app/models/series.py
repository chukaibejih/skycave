"""Standalone head-to-head series: two players, best-of-3/5 across random games.

A series is the tournament fixture without the bracket. It reuses the same engine
(`draw_series`, `host_for_game`, series resolution) and plays each leg in an
ordinary versus room, so a series game counts on the 1v1 leaderboard like any
other. It gets its own table so it survives leg-to-leg (each leg is a fresh room)
and gives a durable head-to-head record for rivalries later.
"""
from datetime import datetime

from sqlalchemy import JSON, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# Lifecycle. Derived transitions on read, matching how rooms/tournaments work.
OPEN = "open"        # created, waiting for the opponent to join
LIVE = "live"        # both players in; legs being played
FINISHED = "finished"  # a player reached wins_needed


class Series(Base):
    __tablename__ = "series"

    # Short public id, used directly in the shareable /series/{id} URL.
    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    status: Mapped[str] = mapped_column(String(16), default=OPEN, index=True)

    # 2 = best of 3, 3 = best of 5. games are drawn to wins_needed*2 - 1 length.
    wins_needed: Mapped[int] = mapped_column(Integer, default=2)

    # Player identity is snapshotted at create/join, so a series card renders
    # without a live profile fetch (mirrors the tournament entrant snapshot).
    player1_did: Mapped[str] = mapped_column(String(255), index=True)
    player1_handle: Mapped[str] = mapped_column(String(255), default="")
    player1_avatar: Mapped[str | None] = mapped_column(String(512), nullable=True)
    player2_did: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    player2_handle: Mapped[str | None] = mapped_column(String(255), nullable=True)
    player2_avatar: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # The games of this series, drawn up front so both players know what's coming.
    games: Mapped[list] = mapped_column(JSON, default=list)      # [game_type, ...]
    # Per decided leg: {"game_type", "winner_did", "room_id"}. The score is
    # derived from this, never stored twice.
    results: Mapped[list] = mapped_column(JSON, default=list)
    # One room id per leg played (index = leg), kept apart from results so a room
    # can be open before it has an outcome.
    rooms: Mapped[list] = mapped_column(JSON, default=list)

    winner_did: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
