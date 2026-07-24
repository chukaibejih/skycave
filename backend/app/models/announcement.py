"""Posts the @skycave.space account owes the world, written down before sending.

An outbox, not a direct call. A tournament result becomes postable at the exact
moment a game ends, which is the worst possible place to make a network request:
the players are waiting on that response, Bluesky might be slow or down, and a
retry there would either block them or lose the post entirely.

So the state change writes a row instead, in the same transaction that decided
the fixture. Committing the result and owing the post are one atomic act: it is
impossible to crown a champion without queueing the announcement, or to queue
one for a result that got rolled back. A drain endpoint (host cron, the same way
the daily roundup runs) does the network later, and can retry as often as it
likes without any of it touching a player.

`dedupe_key` is what makes it exactly-once. Every enqueue site derives a stable
key from what happened ("<tournament>:round:2"), so the unique index refuses a
second copy even though the enqueue runs on every read that resolves the round.
"""
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AnnouncementOutbox(Base):
    __tablename__ = "announcement_outbox"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # What produced this, for reading the table by eye and for per-kind limits.
    kind: Mapped[str] = mapped_column(String(32), index=True)
    # Stable identity of the event. Unique, so enqueueing twice is a no-op.
    dedupe_key: Mapped[str] = mapped_column(String(120), unique=True, index=True)

    # Composed at enqueue time, not at send time. The post says what was true
    # when it happened, so a drain that runs hours late is still accurate.
    text: Mapped[str] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    posted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    # Last failure, kept so a stuck post can be diagnosed without log archaeology.
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
