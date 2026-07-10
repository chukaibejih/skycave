"""Request bodies for The Cave. Responses are role-filtered dicts built by the
service (the secrecy boundary lives there, not in a schema). No em dashes."""
from __future__ import annotations

from pydantic import BaseModel


class CaseDraftIn(BaseModel):
    title: str | None = None
    premise: str | None = None
    difficulty: str | None = None
    case_type: str | None = None
    answer: str | None = None
    correct_text: str | None = None
    wrong_text: str | None = None
    allow_resubmit: bool | None = None
    suspicion_options: list[dict] | None = None


class EvidenceIn(BaseModel):
    type: str = "text"
    content: str = ""
    assignment: str = "both"  # A | B | both
    is_red_herring: bool = False
    order: int = 0


class NotepadIn(BaseModel):
    content: str


class SuspicionIn(BaseModel):
    option_key: str
    status: str  # pinned | ruled_out | flagged | none


class ConfirmIn(BaseModel):
    answer: str
