"""AT Protocol identity helpers.

The interactive OAuth flow (PAR + DPoP token exchange + session cookie) runs in
the Node OAuth sidecar (oauth-sidecar/). This module only handles identity
lookups + persistence used once the sidecar has verified a DID:
  - resolve_handle -> DID   (com.atproto.identity.resolveHandle)
  - fetch_profile(DID)      (app.bsky.actor.getProfile, public AppView)
  - upsert_and_tokenize     (persist the User + mint a Skycave JWT)
"""
from __future__ import annotations

import re

import httpx

from app.core.config import settings
from app.core.security import create_token

PUBLIC_APPVIEW = "https://public.api.bsky.app"
DEFAULT_PDS = "https://bsky.social"

_DID_RE = re.compile(r"^did:(plc|web):[a-zA-Z0-9._:%-]+$")


def is_did(value: str) -> bool:
    return bool(_DID_RE.match(value))


async def resolve_handle(handle: str) -> str | None:
    """Resolve a Bluesky handle (e.g. alice.bsky.social) to its DID."""
    handle = handle.strip().lstrip("@")
    if is_did(handle):
        return handle
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.get(
                f"{DEFAULT_PDS}/xrpc/com.atproto.identity.resolveHandle",
                params={"handle": handle},
            )
            r.raise_for_status()
            return r.json().get("did")
        except httpx.HTTPError:
            return None


async def fetch_profile(actor: str) -> dict | None:
    """Fetch public profile (handle, display name, avatar) by DID or handle."""
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.get(
                f"{PUBLIC_APPVIEW}/xrpc/app.bsky.actor.getProfile",
                params={"actor": actor},
            )
            r.raise_for_status()
            data = r.json()
            return {
                "did": data["did"],
                "handle": data["handle"],
                "display_name": data.get("displayName") or data["handle"],
                "avatar_url": data.get("avatar"),
            }
        except (httpx.HTTPError, KeyError):
            return None


async def upsert_and_tokenize(profile: dict) -> str:
    """Persist/refresh the User row and mint a Skycave JWT for them."""
    from app.core.database import AsyncSessionLocal
    from app.models import User

    async with AsyncSessionLocal() as db:
        user = await db.get(User, profile["did"])
        if user is None:
            user = User(did=profile["did"])
            db.add(user)
        user.handle = profile["handle"]
        user.display_name = profile["display_name"]
        user.avatar_url = profile["avatar_url"]
        await db.commit()

    return create_token(
        profile["did"],
        is_guest=False,
        handle=profile["handle"],
        display_name=profile["display_name"],
        avatar_url=profile["avatar_url"],
    )


