"""Shared auth dependencies for REST + WebSocket."""
from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

from app.core.security import decode_token
from app.schemas.rest import Identity


def identity_from_token(token: str | None) -> Identity | None:
    if not token:
        return None
    payload = decode_token(token)
    if not payload:
        return None
    return Identity(
        id=payload["sub"],
        is_guest=payload.get("is_guest", True),
        handle=payload.get("handle", "player"),
        display_name=payload.get("display_name") or payload.get("handle", "player"),
        avatar_url=payload.get("avatar_url"),
    )


async def get_current_identity(
    authorization: Annotated[str | None, Header()] = None,
) -> Identity:
    """Require a valid bearer token (Bluesky user or guest)."""
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:]
    identity = identity_from_token(token)
    if identity is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid token",
        )
    return identity


async def get_optional_identity(
    authorization: Annotated[str | None, Header()] = None,
) -> Identity | None:
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:]
    return identity_from_token(token)


async def require_admin(
    authorization: Annotated[str | None, Header()] = None,
) -> bool:
    """Require a valid admin bearer token (issued by POST /admin/login)."""
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:]
    payload = decode_token(token) if token else None
    if not payload or not payload.get("admin"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin auth required"
        )
    return True


async def get_bluesky_identity(
    identity: Annotated[Identity, Depends(get_current_identity)],
) -> Identity:
    """Require a connected Bluesky account (no guests). Used by The Cave."""
    if identity.is_guest:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The Cave requires a Bluesky account",
        )
    return identity


CurrentIdentity = Annotated[Identity, Depends(get_current_identity)]
OptionalIdentity = Annotated[Identity | None, Depends(get_optional_identity)]
BlueskyIdentity = Annotated[Identity, Depends(get_bluesky_identity)]
AdminAuth = Annotated[bool, Depends(require_admin)]
