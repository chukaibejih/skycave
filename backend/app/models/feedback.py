from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Feedback(Base):
    """A piece of user feedback, submitted from the app and read in /admin.

    Submitter fields are best-effort: guests are identified by their chosen
    display name, Bluesky users by handle. Anonymous submissions are allowed
    (no token), in which case submitter fields are null.
    """

    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    message: Mapped[str] = mapped_column(Text)

    submitter_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    submitter_handle: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_guest: Mapped[bool] = mapped_column(Boolean, default=True)

    # Where it was sent from (pathname) + UA, for context.
    page: Mapped[str | None] = mapped_column(String(255), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(400), nullable=True)

    # Triaged in the back office.
    resolved: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
