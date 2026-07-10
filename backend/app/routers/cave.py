"""The Cave API. Every route requires a connected Bluesky account (no guests).

Room reads are role-filtered by the service; this router only wires HTTP to it.
See the_cave_plan.md. No em dashes.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import BlueskyIdentity
from app.schemas.cave import CaseDraftIn, ConfirmIn, EvidenceIn, NotepadIn, SuspicionIn
from app.services import cave

router = APIRouter(prefix="/cave", tags=["cave"])


# ── Builder (architect) ──
@router.post("/cases")
async def create_case(identity: BlueskyIdentity, db: AsyncSession = Depends(get_db)):
    c = await cave.create_case(db, identity)
    return {"id": c.id, "status": c.status}


@router.get("/cases/{case_id}/edit")
async def edit_case(case_id: str, identity: BlueskyIdentity, db: AsyncSession = Depends(get_db)):
    return await cave.architect_case_full(db, case_id, identity.id)


@router.patch("/cases/{case_id}")
async def update_case(case_id: str, body: CaseDraftIn, identity: BlueskyIdentity, db: AsyncSession = Depends(get_db)):
    await cave.update_case(db, case_id, identity.id, body.model_dump(exclude_unset=True))
    return await cave.architect_case_full(db, case_id, identity.id)


@router.post("/cases/{case_id}/evidence")
async def add_evidence(case_id: str, body: EvidenceIn, identity: BlueskyIdentity, db: AsyncSession = Depends(get_db)):
    e = await cave.add_evidence(db, case_id, identity.id, body.model_dump())
    return {"id": e.id}


@router.patch("/cases/{case_id}/evidence/{eid}")
async def edit_evidence(case_id: str, eid: str, body: EvidenceIn, identity: BlueskyIdentity, db: AsyncSession = Depends(get_db)):
    await cave.update_evidence(db, case_id, eid, identity.id, body.model_dump(exclude_unset=True))
    return {"ok": True}


@router.delete("/cases/{case_id}/evidence/{eid}")
async def remove_evidence(case_id: str, eid: str, identity: BlueskyIdentity, db: AsyncSession = Depends(get_db)):
    await cave.delete_evidence(db, case_id, eid, identity.id)
    return {"ok": True}


@router.post("/cases/{case_id}/publish")
async def publish(case_id: str, identity: BlueskyIdentity, db: AsyncSession = Depends(get_db)):
    c = await cave.publish_case(db, case_id, identity.id)
    return {"id": c.id, "status": c.status}


# ── Discovery ──
@router.get("/cases")
async def browse(
    identity: BlueskyIdentity,
    db: AsyncSession = Depends(get_db),
    unsolved: bool = False,
    difficulty: str | None = None,
    sort: str = Query("newest", pattern="^(newest|most_attempted)$"),
):
    return {"cases": await cave.browse_cases(db, unsolved_only=unsolved, difficulty=difficulty, sort=sort)}


@router.get("/cases/{case_id}")
async def case_preview(case_id: str, db: AsyncSession = Depends(get_db)):
    # Public teaser: the shareable case link must open for a logged-out visitor
    # (they sign in to claim a spot). Reveals only title/premise/difficulty, never
    # the split evidence or the answer.
    return await cave.get_case_public(db, case_id)


# ── Claim + room ──
@router.post("/cases/{case_id}/rooms")
async def claim(case_id: str, identity: BlueskyIdentity, db: AsyncSession = Depends(get_db)):
    room, role = await cave.claim_room(db, case_id, identity)
    return {"room_id": room.id, "role": role, "status": room.status}


@router.get("/rooms/{room_id}")
async def room(room_id: str, identity: BlueskyIdentity, db: AsyncSession = Depends(get_db), since: int = 0):
    return await cave.room_state(db, room_id, identity.id, since)


@router.post("/rooms/{room_id}/notepad")
async def notepad(room_id: str, body: NotepadIn, identity: BlueskyIdentity, db: AsyncSession = Depends(get_db)):
    n = await cave.add_note(db, room_id, identity, body.content)
    return {"id": n.id}


@router.patch("/rooms/{room_id}/suspicion")
async def suspicion(room_id: str, body: SuspicionIn, identity: BlueskyIdentity, db: AsyncSession = Depends(get_db)):
    await cave.set_suspicion(db, room_id, identity.id, body.option_key, body.status)
    return {"ok": True}


@router.post("/rooms/{room_id}/confirm")
async def confirm(room_id: str, body: ConfirmIn, identity: BlueskyIdentity, db: AsyncSession = Depends(get_db)):
    return await cave.confirm_verdict(db, room_id, identity, body.answer)


@router.get("/rooms/{room_id}/reveal")
async def reveal(room_id: str, identity: BlueskyIdentity, db: AsyncSession = Depends(get_db)):
    return await cave.reveal(db, room_id, identity.id)


# ── Dashboards ──
@router.get("/architect/cases")
async def my_cases(identity: BlueskyIdentity, db: AsyncSession = Depends(get_db)):
    return {"cases": await cave.architect_cases(db, identity.id)}


@router.get("/solver/rooms")
async def my_rooms(identity: BlueskyIdentity, db: AsyncSession = Depends(get_db)):
    return {"rooms": await cave.solver_rooms(db, identity.id)}
