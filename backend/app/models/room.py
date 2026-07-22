from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Room(Base):
    """Durable record of a room.

    Live, fast-changing room state (players, current round, scores) lives in
    Redis. This table is the persistent anchor used for invite-link previews
    (Open Graph) and history - it survives Redis eviction/restart.
    """

    __tablename__ = "rooms"

    # Short, URL-friendly room code, e.g. "k7gq2" - used in the invite link.
    id: Mapped[str] = mapped_column(String(16), primary_key=True)

    game_type: Mapped[str] = mapped_column(String(64), index=True)

    # waiting | in_progress | finished
    status: Mapped[str] = mapped_column(
        String(32), default="waiting", server_default="waiting"
    )

    # DID for Bluesky hosts, or "guest:<id>" for guest hosts.
    host_id: Mapped[str] = mapped_column(String(255), index=True)
    host_handle: Mapped[str] = mapped_column(String(255))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
