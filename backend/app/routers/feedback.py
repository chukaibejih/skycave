from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import OptionalIdentity
from app.models import Feedback
from app.schemas.rest import FeedbackAck, FeedbackRequest

router = APIRouter(tags=["feedback"])


@router.post("/feedback", response_model=FeedbackAck)
async def submit_feedback(
    body: FeedbackRequest,
    identity: OptionalIdentity,
    user_agent: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> FeedbackAck:
    """Anyone can send feedback (guest, Bluesky user, or anonymous)."""
    # Identify the sender best-effort: handle for Bluesky users, chosen name for
    # guests. Never required.
    handle = None
    is_guest = True
    if identity is not None:
        is_guest = identity.is_guest
        handle = identity.handle if not identity.is_guest else identity.display_name

    db.add(
        Feedback(
            message=body.message.strip(),
            submitter_id=identity.id if identity else None,
            submitter_handle=handle,
            is_guest=is_guest,
            page=body.page,
            user_agent=user_agent[:400] if user_agent else None,
        )
    )
    await db.commit()
    return FeedbackAck()
