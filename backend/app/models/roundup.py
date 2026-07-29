"""Who the daily roundup shouted out, so it never shouts the same player two
days running.

One row per day the roundup covered. The next day's compose reads the previous
row and steers the standout score away from those handles, so a dominant player
gets the spotlight, then it moves to someone else, rather than parking on the
same name every morning.
"""
from datetime import datetime

from sqlalchemy import JSON, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class RoundupShoutout(Base):
    __tablename__ = "roundup_shoutouts"

    # ISO date (YYYY-MM-DD) the roundup covered. One roundup per day, so the day
    # is the natural primary key and re-running a day just overwrites it.
    day: Mapped[str] = mapped_column(String(10), primary_key=True)
    # The handles featured that day (lead, standout score, second voice).
    handles: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
