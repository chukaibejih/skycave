"""The Cave: async collaborative mystery logic.

This module owns the secrecy invariant. `room_state` returns ONLY the viewer's
own evidence (their private cards plus shared cards) and never the answer, the
partner's private cards, or red-herring flags. The full reveal is exposed only
after a room resolves. See the_cave_plan.md. No em dashes.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CaveCase, CaveEvidence, CaveNotepad, CaveRoom, CaveSuspicion
from app.schemas.rest import Identity

MIN_EVIDENCE = 4


def normalize_answer(s: str | None) -> str:
    """Lowercased, trimmed, whitespace-collapsed. The only matching rule."""
    return " ".join(str(s or "").strip().lower().split())


def _role_of(room: CaveRoom, did: str) -> str | None:
    if room.solver_a_did == did:
        return "A"
    if room.solver_b_did == did:
        return "B"
    return None


def _other(role: str) -> str:
    return "B" if role == "A" else "A"


# --------------------------------------------------------------------------- #
# Architect: build + publish
# --------------------------------------------------------------------------- #
async def create_case(db: AsyncSession, architect: Identity) -> CaveCase:
    case = CaveCase(architect_did=architect.id, architect_handle=architect.handle)
    db.add(case)
    await db.commit()
    await db.refresh(case)
    return case


async def _owned_draft(db: AsyncSession, case_id: str, architect_did: str) -> CaveCase:
    case = await db.get(CaveCase, case_id)
    if case is None:
        raise HTTPException(404, "Case not found")
    if case.architect_did != architect_did:
        raise HTTPException(403, "Not your case")
    if case.status != "draft":
        raise HTTPException(409, "Case is already published")
    return case


async def update_case(db, case_id, architect_did, data: dict) -> CaveCase:
    case = await _owned_draft(db, case_id, architect_did)
    for field in (
        "title",
        "premise",
        "difficulty",
        "case_type",
        "correct_text",
        "wrong_text",
        "allow_resubmit",
        "suspicion_options",
    ):
        if data.get(field) is not None:
            setattr(case, field, data[field])
    if data.get("answer") is not None:
        case.answer_normalized = normalize_answer(data["answer"])
    await db.commit()
    await db.refresh(case)
    return case


async def add_evidence(db, case_id, architect_did, ev: dict) -> CaveEvidence:
    case = await _owned_draft(db, case_id, architect_did)
    card = CaveEvidence(
        case_id=case.id,
        type=ev.get("type", "text"),
        content=ev.get("content", ""),
        assignment=ev.get("assignment", "both") if ev.get("assignment") in ("A", "B", "both") else "both",
        is_red_herring=bool(ev.get("is_red_herring", False)),
        order=int(ev.get("order", 0)),
    )
    db.add(card)
    await db.commit()
    await db.refresh(card)
    return card


async def publish_checklist(db, case: CaveCase) -> list[str]:
    """Return a list of specific, human-readable blockers (empty = ready)."""
    ev = (
        await db.execute(select(CaveEvidence).where(CaveEvidence.case_id == case.id))
    ).scalars().all()
    a_only = sum(1 for e in ev if e.assignment == "A")
    b_only = sum(1 for e in ev if e.assignment == "B")
    errors = []
    if not case.title.strip():
        errors.append("Add a case title.")
    if not case.premise.strip():
        errors.append("Write the case premise.")
    if len(ev) < MIN_EVIDENCE:
        errors.append(f"Add at least {MIN_EVIDENCE} evidence cards (you have {len(ev)}).")
    if a_only < 1:
        errors.append("Assign at least one card to Solver A only.")
    if b_only < 1:
        errors.append("Assign at least one card to Solver B only.")
    if not case.answer_normalized:
        errors.append("Set the answer.")
    if not case.correct_text.strip():
        errors.append("Write the correct verdict text.")
    if not case.wrong_text.strip():
        errors.append("Write the wrong verdict text.")
    return errors


async def publish_case(db, case_id, architect_did) -> CaveCase:
    case = await _owned_draft(db, case_id, architect_did)
    errors = await publish_checklist(db, case)
    if errors:
        raise HTTPException(422, {"message": "Case is not ready", "errors": errors})
    case.status = "published"
    case.published_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(case)
    return case


# --------------------------------------------------------------------------- #
# Solve: claim + room state (secrecy lives here)
# --------------------------------------------------------------------------- #
async def claim_room(db, case_id: str, solver: Identity) -> tuple[CaveRoom, str]:
    """Join the oldest room still waiting for a Solver B, else open a fresh one.

    Atomic: the waiting room is row-locked (SKIP LOCKED) so two simultaneous
    claimers can never grab the same seat.
    """
    case = await db.get(CaveCase, case_id)
    if case is None or case.status != "published":
        raise HTTPException(404, "Case not available")
    if case.architect_did == solver.id:
        raise HTTPException(403, "You cannot solve your own case")

    # Already in a room for this case? Return it (idempotent claim).
    existing = (
        await db.execute(
            select(CaveRoom).where(
                CaveRoom.case_id == case.id,
                or_(CaveRoom.solver_a_did == solver.id, CaveRoom.solver_b_did == solver.id),
            )
        )
    ).scalars().first()
    if existing is not None:
        return existing, _role_of(existing, solver.id) or "A"

    waiting = (
        await db.execute(
            select(CaveRoom)
            .where(
                CaveRoom.case_id == case.id,
                CaveRoom.status == "waiting",
                CaveRoom.solver_b_did.is_(None),
                CaveRoom.solver_a_did != solver.id,
            )
            .order_by(CaveRoom.created_at)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
    ).scalars().first()

    if waiting is not None:
        waiting.solver_b_did = solver.id
        waiting.solver_b_handle = solver.handle
        waiting.status = "active"
        case.attempts += 1  # a full pair is now attempting
        await db.commit()
        await db.refresh(waiting)
        return waiting, "B"

    room = CaveRoom(
        case_id=case.id,
        solver_a_did=solver.id,
        solver_a_handle=solver.handle,
        status="waiting",
    )
    db.add(room)
    await db.commit()
    await db.refresh(room)
    return room, "A"


async def _require_room_member(db, room_id: str, did: str) -> tuple[CaveRoom, str]:
    room = await db.get(CaveRoom, room_id)
    if room is None:
        raise HTTPException(404, "Room not found")
    role = _role_of(room, did)
    if role is None:
        raise HTTPException(403, "You are not a solver in this room")
    return room, role


async def room_state(db, room_id: str, viewer_did: str, since: int = 0) -> dict:
    """Role-filtered room state. THE secrecy boundary.

    Returns only the viewer's evidence (their private + shared), never the
    answer, the partner's private cards, or red-herring flags.
    """
    room, role = await _require_room_member(db, room_id, viewer_did)
    case = await db.get(CaveCase, room.case_id)

    ev = (
        await db.execute(
            select(CaveEvidence).where(CaveEvidence.case_id == case.id).order_by(CaveEvidence.order)
        )
    ).scalars().all()
    my_evidence = [
        {
            "id": e.id,
            "type": e.type,
            "content": e.content,
            "shared": e.assignment == "both",
        }
        for e in ev
        if e.assignment == role or e.assignment == "both"
    ]
    partner_private_count = sum(1 for e in ev if e.assignment == _other(role))

    notes = (
        await db.execute(
            select(CaveNotepad)
            .where(CaveNotepad.room_id == room.id, CaveNotepad.id > since)
            .order_by(CaveNotepad.id)
        )
    ).scalars().all()
    max_note_id = notes[-1].id if notes else since

    susp = (
        await db.execute(select(CaveSuspicion).where(CaveSuspicion.room_id == room.id))
    ).scalars().all()

    partner_did = room.solver_b_did if role == "A" else room.solver_a_did
    partner_handle = room.solver_b_handle if role == "A" else room.solver_a_handle

    return {
        "room_id": room.id,
        "status": room.status,
        "case": {
            "id": case.id,
            "title": case.title,
            "premise": case.premise,
            "difficulty": case.difficulty,
            "architect_handle": case.architect_handle,
        },
        "your_role": role,
        "your_evidence": my_evidence,
        "partner": {
            "handle": partner_handle,
            "present": partner_did is not None,
            "private_count": partner_private_count,
        },
        "notepad": [
            {
                "role": nd.solver_role,
                "handle": nd.solver_handle,
                "content": nd.content,
                "created_at": nd.created_at.isoformat(),
            }
            for nd in notes
        ],
        "cursor": max_note_id,
        "suspicion_options": case.suspicion_options or [],
        "suspicion": {s.option_key: s.status for s in susp},
        "verdict": {
            "answer": room.verdict_answer,
            "a_confirmed": room.a_confirmed,
            "b_confirmed": room.b_confirmed,
            "your_confirmed": room.a_confirmed if role == "A" else room.b_confirmed,
            "can_submit": room.status == "active",
        },
    }


async def add_note(db, room_id: str, viewer: Identity, content: str) -> CaveNotepad:
    room, role = await _require_room_member(db, room_id, viewer.id)
    text = content.strip()
    if not text:
        raise HTTPException(422, "Empty note")
    note = CaveNotepad(
        room_id=room.id, solver_role=role, solver_handle=viewer.handle, content=text
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note


async def set_suspicion(db, room_id: str, viewer_did: str, option_key: str, status: str) -> None:
    room, role = await _require_room_member(db, room_id, viewer_did)
    if status not in ("pinned", "ruled_out", "flagged", "none"):
        raise HTTPException(422, "Invalid status")
    existing = (
        await db.execute(
            select(CaveSuspicion).where(
                CaveSuspicion.room_id == room.id, CaveSuspicion.option_key == option_key
            )
        )
    ).scalars().first()
    if existing is None:
        db.add(
            CaveSuspicion(room_id=room.id, option_key=option_key, status=status, updated_by_role=role)
        )
    else:
        existing.status = status
        existing.updated_by_role = role
    await db.commit()


async def confirm_verdict(db, room_id: str, viewer: Identity, answer: str) -> dict:
    """Confirm the verdict. Confirming locks the answer; a partner submitting a
    different answer clears both confirmations. Both agreeing resolves the room.
    """
    room, role = await _require_room_member(db, room_id, viewer.id)
    if room.status not in ("active",):
        raise HTTPException(409, "This case is no longer open for a verdict")

    answer = answer.strip()
    if not answer:
        raise HTTPException(422, "Enter an answer")

    # A genuinely different answer resets both agreements (nobody submits what a
    # partner did not agree to). Compared normalized, so the same answer typed
    # with different casing/spacing counts as agreement, not a change.
    if normalize_answer(room.verdict_answer) != normalize_answer(answer):
        room.verdict_answer = answer
        room.a_confirmed = False
        room.b_confirmed = False

    if role == "A":
        room.a_confirmed = True
    else:
        room.b_confirmed = True

    resolved = False
    correct = False
    if room.a_confirmed and room.b_confirmed:
        case = await db.get(CaveCase, room.case_id)
        correct = normalize_answer(answer) == case.answer_normalized
        room.status = "solved" if correct else "failed"
        room.solved_at = datetime.now(timezone.utc)
        if correct:
            case.solves += 1
        else:
            case.fails += 1
        resolved = True

    await db.commit()
    return {
        "status": room.status,
        "a_confirmed": room.a_confirmed,
        "b_confirmed": room.b_confirmed,
        "resolved": resolved,
        "correct": correct if resolved else None,
    }


async def reveal(db, room_id: str, viewer_did: str) -> dict:
    """Full reveal: every card, the answer, the verdict text. Post-resolve only."""
    room, role = await _require_room_member(db, room_id, viewer_did)
    if room.status not in ("solved", "failed"):
        raise HTTPException(409, "The case is not resolved yet")
    case = await db.get(CaveCase, room.case_id)
    ev = (
        await db.execute(
            select(CaveEvidence).where(CaveEvidence.case_id == case.id).order_by(CaveEvidence.order)
        )
    ).scalars().all()
    correct = room.status == "solved"
    return {
        "outcome": room.status,
        "correct": correct,
        "verdict_text": case.correct_text if correct else case.wrong_text,
        "answer": case.answer_normalized,
        "your_answer": room.verdict_answer,
        "allow_resubmit": case.allow_resubmit and not correct,
        "solvers": {"A": room.solver_a_handle, "B": room.solver_b_handle},
        "evidence": [
            {
                "type": e.type,
                "content": e.content,
                "assignment": e.assignment,
                "is_red_herring": e.is_red_herring,
            }
            for e in ev
        ],
    }


# --------------------------------------------------------------------------- #
# Discovery + dashboards
# --------------------------------------------------------------------------- #
async def browse_cases(db, *, unsolved_only: bool = False, difficulty: str | None = None, sort: str = "newest", limit: int = 40) -> list[dict]:
    q = select(CaveCase).where(CaveCase.status == "published")
    if difficulty:
        q = q.where(CaveCase.difficulty == difficulty)
    if unsolved_only:
        q = q.where(CaveCase.solves == 0)
    if sort == "most_attempted":
        q = q.order_by(CaveCase.attempts.desc())
    else:
        q = q.order_by(CaveCase.published_at.desc().nullslast())
    rows = (await db.execute(q.limit(limit))).scalars().all()
    return [_case_card(c) for c in rows]


def _case_card(c: CaveCase) -> dict:
    return {
        "id": c.id,
        "title": c.title,
        "premise": c.premise,
        "difficulty": c.difficulty,
        "architect_handle": c.architect_handle,
        "attempts": c.attempts,
        "solves": c.solves,
        "published_at": c.published_at.isoformat() if c.published_at else None,
    }


async def architect_case_full(db, case_id: str, architect_did: str) -> dict:
    """Full case for its own author to edit (includes answer + red herrings)."""
    case = await db.get(CaveCase, case_id)
    if case is None:
        raise HTTPException(404, "Case not found")
    if case.architect_did != architect_did:
        raise HTTPException(403, "Not your case")
    ev = (
        await db.execute(
            select(CaveEvidence).where(CaveEvidence.case_id == case.id).order_by(CaveEvidence.order)
        )
    ).scalars().all()
    errors = await publish_checklist(db, case) if case.status == "draft" else []
    return {
        "id": case.id,
        "title": case.title,
        "premise": case.premise,
        "difficulty": case.difficulty,
        "case_type": case.case_type,
        "answer": case.answer_normalized,
        "correct_text": case.correct_text,
        "wrong_text": case.wrong_text,
        "allow_resubmit": case.allow_resubmit,
        "suspicion_options": case.suspicion_options or [],
        "status": case.status,
        "attempts": case.attempts,
        "solves": case.solves,
        "fails": case.fails,
        "checklist_errors": errors,
        "evidence": [
            {
                "id": e.id,
                "type": e.type,
                "content": e.content,
                "assignment": e.assignment,
                "is_red_herring": e.is_red_herring,
                "order": e.order,
            }
            for e in ev
        ],
    }


async def get_case_public(db, case_id: str) -> dict:
    case = await db.get(CaveCase, case_id)
    if case is None or case.status != "published":
        raise HTTPException(404, "Case not found")
    return _case_card(case)


async def architect_cases(db, architect_did: str) -> list[dict]:
    rows = (
        await db.execute(
            select(CaveCase).where(CaveCase.architect_did == architect_did).order_by(CaveCase.created_at.desc())
        )
    ).scalars().all()
    out = []
    for c in rows:
        in_progress = (
            await db.execute(
                select(func.count()).select_from(CaveRoom).where(
                    CaveRoom.case_id == c.id, CaveRoom.status.in_(("waiting", "active"))
                )
            )
        ).scalar() or 0
        out.append({**_case_card(c), "status": c.status, "fails": c.fails, "in_progress": in_progress})
    return out


async def solver_rooms(db, solver_did: str) -> list[dict]:
    rows = (
        await db.execute(
            select(CaveRoom)
            .where(or_(CaveRoom.solver_a_did == solver_did, CaveRoom.solver_b_did == solver_did))
            .order_by(CaveRoom.created_at.desc())
        )
    ).scalars().all()
    out = []
    for r in rows:
        case = await db.get(CaveCase, r.case_id)
        out.append(
            {
                "room_id": r.id,
                "case_title": case.title if case else "",
                "case_id": r.case_id,
                "status": r.status,
                "your_role": _role_of(r, solver_did),
                "created_at": r.created_at.isoformat(),
            }
        )
    return out
