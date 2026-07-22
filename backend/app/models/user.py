from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class User(Base):
    """A Bluesky-authenticated player.

    The AT Protocol DID is the canonical identifier - never email/handle,
    since handles can change while a DID is permanent. Guests are not
    persisted here; they live only in their JWT + Redis room state.
    """

    __tablename__ = "users"

    # AT Protocol DID, e.g. "did:plc:ewvi7nxzyoun6zhxrhs64oiz"
    did: Mapped[str] = mapped_column(String(255), primary_key=True)

    handle: Mapped[str] = mapped_column(String(255), index=True)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    # Aggregate stats (denormalized for cheap reads on the stats endpoint).
    games_played: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    games_won: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    total_score: Mapped[int] = mapped_column(
        BigInteger, default=0, server_default="0", index=True  # leaderboard sort
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
