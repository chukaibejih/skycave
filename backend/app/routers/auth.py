"""Auth routes: guest sessions + Bluesky (AT Protocol) login.

Bluesky login is handled by the Node OAuth sidecar (see oauth-sidecar/), which
runs the full DPoP authorization-code flow and sets an httpOnly session cookie.
FastAPI trusts the sidecar for identity: POST /auth/bluesky/complete reads that
cookie, asks the sidecar (internal-only) for the verified DID, then mints a
Skycave JWT. The guest path is fully self-contained.
"""
from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException, Request

from app.core.config import settings
from app.core.ids import new_guest_id
from app.core.security import create_token
from app.core.deps import CurrentIdentity
from app.schemas.rest import GuestRequest, Identity, TokenResponse
from app.services import bluesky_auth

router = APIRouter(prefix="/auth", tags=["auth"])

SESSION_COOKIE = "skycave_sid"


@router.post("/guest", response_model=TokenResponse)
async def guest_login(body: GuestRequest) -> TokenResponse:
    """Create a temporary guest identity. No account, nothing persisted."""
    guest_id = new_guest_id()
    display = body.display_name.strip()
    handle = "guest"
    token = create_token(
        guest_id,
        is_guest=True,
        handle=handle,
        display_name=display,
        avatar_url=None,
    )
    return TokenResponse(
        token=token,
        identity=Identity(
            id=guest_id,
            is_guest=True,
            handle=handle,
            display_name=display,
            avatar_url=None,
        ),
    )


@router.get("/me", response_model=Identity)
async def me(identity: CurrentIdentity) -> Identity:
    return identity


@router.post("/bluesky/complete", response_model=TokenResponse)
async def bluesky_complete(request: Request) -> TokenResponse:
    """Exchange the sidecar's OAuth session cookie for a Skycave JWT.

    The browser hits the sidecar (api.skycave.space/oauth/login -> callback),
    which verifies DID ownership and sets the `skycave_sid` cookie. The frontend
    then calls this endpoint (cookie auto-sent, same-site); we resolve the DID
    from the sidecar's internal /oauth/session, fetch the public profile, persist
    the user, and issue our JWT.
    """
    sid = request.cookies.get(SESSION_COOKIE)
    if not sid:
        raise HTTPException(status_code=401, detail="No Bluesky session")

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{settings.oauth_sidecar_url.rstrip('/')}/oauth/session",
                headers={
                    "x-internal-secret": settings.oauth_internal_secret,
                    "cookie": f"{SESSION_COOKIE}={sid}",
                },
            )
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="OAuth service unavailable")

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Bluesky session invalid")

    did = resp.json().get("did")
    if not did:
        raise HTTPException(status_code=401, detail="Bluesky session invalid")

    profile = await bluesky_auth.fetch_profile(did) or {
        "did": did,
        "handle": did,
        "display_name": did,
        "avatar_url": None,
    }
    token = await bluesky_auth.upsert_and_tokenize(profile)
    return TokenResponse(
        token=token,
        identity=Identity(
            id=profile["did"],
            is_guest=False,
            handle=profile["handle"],
            display_name=profile["display_name"],
            avatar_url=profile["avatar_url"],
        ),
    )
