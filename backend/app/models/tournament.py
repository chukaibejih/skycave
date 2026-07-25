"""Weekend tournament: the event, its entrants, and its bracket.

Shape follows `weekend_tournament_plan.md`. Three tables:

  Tournament        the event, its cap, and the three weekend anchors
  TournamentEntrant one signed-up player (identity snapshotted at signup)
  TournamentMatch   one fixture: a best-of-3 series in one bracket slot

The actual games are still ordinary rooms writing ordinary `game_sessions`
rows (mode="tournament"), so a tournament win counts on the 1v1 leaderboard
like any other. Only the bracket lives here.
"""
from datetime import datetime

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# Lifecycle. Transitions are derived on read (see services/tournament.py), not
# by a scheduler, matching how room expiry already works.
REGISTERING = "registering"   # signups open
LOCKED = "locked"             # registration closed, bracket drawn, play not open
IN_PROGRESS = "in_progress"   # inside the play window
FINISHED = "finished"         # champion decided

# Match lifecycle.
M_PENDING = "pending"         # waiting on players (earlier round unresolved)
M_READY = "ready"             # both players known, awaiting check-in
M_LIVE = "live"               # series under way
M_DONE = "done"
M_BYE = "bye"                 # no opponent, advances free


class Tournament(Base):
    __tablename__ = "tournaments"

    # Short public id, used directly in the shareable bracket URL.
    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), default="Skycave Weekend Tournament")
    status: Mapped[str] = mapped_column(String(16), default=REGISTERING, index=True)

    # The cap is a per-tournament knob, not a constant. The plan's fairness
    # floor (a round window must not land wholly inside someone's night) puts
    # the hard ceiling at 64.
    max_players: Mapped[int] = mapped_column(Integer, default=8)

    # The three weekend anchors, all stored UTC. registration_closes_at is also
    # the fixture reveal, and is set from Thursday 08:00 America/Los_Angeles.
    registration_closes_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    play_opens_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    play_closes_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    # Derived at lock time from the final field size.
    bracket_size: Mapped[int] = mapped_column(Integer, default=0)
    rounds: Mapped[int] = mapped_column(Integer, default=0)
    # Published round deadlines, [{"round": 1, "deadline": iso}, ...]. Written
    # once at lock and never moved earlier, so an early finish lengthens the
    # next round rather than shortening it.
    round_deadlines: Mapped[list] = mapped_column(JSON, default=list)

    champion_did: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # When the live ticking countdown should start showing, or NULL to use the
    # default gate (the Wednesday before close, so a normal week is calm early
    # and only ticks in the final stretch). A launch event opened mid-week sets
    # this to its creation time so it counts down from the moment it goes live.
    countdown_from: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class TournamentEntrant(Base):
    __tablename__ = "tournament_entrants"
    __table_args__ = (
        # One entry per person. Also the guard against a double-submit.
        UniqueConstraint("tournament_id", "did", name="uq_entrant_once"),
        Index("ix_entrant_tournament", "tournament_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tournament_id: Mapped[str] = mapped_column(
        String(16), ForeignKey("tournaments.id"), index=True
    )

    did: Mapped[str] = mapped_column(String(255), index=True)
    # Identity is snapshotted at signup so the bracket still renders a real
    # person if a later profile fetch fails.
    handle: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(255))
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Assigned at lock, when the draw happens.
    seat: Mapped[int | None] = mapped_column(Integer, nullable=True)
    eliminated_round: Mapped[int | None] = mapped_column(Integer, nullable=True)

    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class TournamentMatch(Base):
    __tablename__ = "tournament_matches"
    __table_args__ = (
        UniqueConstraint("tournament_id", "round", "slot", name="uq_match_slot"),
        Index("ix_match_tournament_round", "tournament_id", "round"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tournament_id: Mapped[str] = mapped_column(
        String(16), ForeignKey("tournaments.id"), index=True
    )

    round: Mapped[int] = mapped_column(Integer)   # 1-based
    slot: Mapped[int] = mapped_column(Integer)    # position within the round
    status: Mapped[str] = mapped_column(String(16), default=M_PENDING)

    player1_did: Mapped[str | None] = mapped_column(String(255), nullable=True)
    player2_did: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # The three games of this series, drawn at bracket generation and published
    # up front so both players know exactly what they face.
    games: Mapped[list] = mapped_column(JSON, default=list)
    # Per game: {"game_type", "winner_did", "room_id", "replays", "scores"}.
    # The series is derived from this, never stored twice.
    results: Mapped[list] = mapped_column(JSON, default=list)

    # DIDs that have checked in. The room only opens once both are present, so
    # nobody collects a walkover while their opponent is asleep.
    checked_in: Mapped[list] = mapped_column(JSON, default=list)

    # One room id per leg played, indexed by how many results existed when the
    # room opened. A leg is a single sitting, so a replayed draw takes its own
    # slot here even though it does not advance the series. Keeping this apart
    # from `results` is what lets a room be open before it has an outcome.
    rooms: Mapped[list] = mapped_column(JSON, default=list)

    winner_did: Mapped[str | None] = mapped_column(String(255), nullable=True)
    deadline: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
