"""The Cave data model: async collaborative mystery cases.

Five cave_ tables, isolated from the real-time game tables. IDs are uuid4 hex.
See the_cave_plan.md for the design and the secrecy invariant. No em dashes.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


def _uuid() -> str:
    return uuid.uuid4().hex


class CaveCase(Base):
    """A case an Architect builds and publishes."""

    __tablename__ = "cave_cases"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    architect_did: Mapped[str] = mapped_column(String(255), index=True)
    architect_handle: Mapped[str] = mapped_column(String(255))

    title: Mapped[str] = mapped_column(String(200), default="")
    premise: Mapped[str] = mapped_column(Text, default="")
    difficulty: Mapped[str] = mapped_column(String(16), default="medium")  # easy|medium|hard
    case_type: Mapped[str] = mapped_column(String(32), default="mystery")

    answer_normalized: Mapped[str] = mapped_column(String(255), default="")
    correct_text: Mapped[str] = mapped_column(Text, default="")
    wrong_text: Mapped[str] = mapped_column(Text, default="")
    allow_resubmit: Mapped[bool] = mapped_column(Boolean, default=False)

    # Options the suspicion board offers, architect-defined: [{"key","label"}].
    suspicion_options: Mapped[list] = mapped_column(JSON, default=list)

    status: Mapped[str] = mapped_column(
        String(16), default="draft", server_default="draft", index=True
    )  # draft|published|archived

    # Denormalized counters (updated at write so browse/dashboards never COUNT()).
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    solves: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    fails: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class CaveEvidence(Base):
    """One evidence card. `assignment` is the secrecy pivot of the whole game."""

    __tablename__ = "cave_evidence"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    case_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("cave_cases.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[str] = mapped_column(String(16), default="text")  # text|image (MVP)
    content: Mapped[str] = mapped_column(Text, default="")  # text, or an R2 url for images
    assignment: Mapped[str] = mapped_column(String(4), default="both")  # A|B|both
    is_red_herring: Mapped[bool] = mapped_column(Boolean, default=False)
    order: Mapped[int] = mapped_column(Integer, default=0)


class CaveRoom(Base):
    """An isolated attempt by one pair of solvers at a case."""

    __tablename__ = "cave_rooms"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    case_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("cave_cases.id", ondelete="CASCADE"), index=True
    )
    solver_a_did: Mapped[str] = mapped_column(String(255), index=True)
    solver_a_handle: Mapped[str] = mapped_column(String(255))
    solver_b_did: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    solver_b_handle: Mapped[str | None] = mapped_column(String(255), nullable=True)

    status: Mapped[str] = mapped_column(
        String(16), default="waiting", server_default="waiting", index=True
    )  # waiting|active|solved|failed

    verdict_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    a_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    b_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    solved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class CaveNotepad(Base):
    """Append-only investigation log. The autoincrement id is the poll cursor."""

    __tablename__ = "cave_notepad"
    # (room_id, id) serves both room lookups and the monotonic poll cursor.
    __table_args__ = (Index("ix_cave_notepad_cursor", "room_id", "id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("cave_rooms.id", ondelete="CASCADE")
    )
    solver_role: Mapped[str] = mapped_column(String(1))  # A|B
    solver_handle: Mapped[str] = mapped_column(String(255))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class CaveSuspicion(Base):
    """Per-option state on a room's shared suspicion board (upserted)."""

    __tablename__ = "cave_suspicion"
    __table_args__ = (
        Index("ix_cave_suspicion_room_option", "room_id", "option_key", unique=True),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("cave_rooms.id", ondelete="CASCADE")
    )
    option_key: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default="none")  # pinned|ruled_out|flagged|none
    updated_by_role: Mapped[str] = mapped_column(String(1), default="A")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
