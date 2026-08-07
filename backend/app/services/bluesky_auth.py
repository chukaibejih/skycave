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


async def fetch_follows(actor: str, max_pages: int = 15) -> list[str]:
    """Every DID `actor` follows, via the public AppView (no auth needed).

    Paginated 100/page; capped at max_pages (1,500 follows) so a account that
    follows tens of thousands can't turn one request into a fan of calls. The
    cap only bites the long tail - well past any realistic friends overlap.
    """
    dids: list[str] = []
    cursor: str | None = None
    async with httpx.AsyncClient(timeout=10) as client:
        for _ in range(max_pages):
            params: dict = {"actor": actor, "limit": 100}
            if cursor:
                params["cursor"] = cursor
            try:
                r = await client.get(
                    f"{PUBLIC_APPVIEW}/xrpc/app.bsky.graph.getFollows", params=params
                )
                r.raise_for_status()
                data = r.json()
            except httpx.HTTPError:
                break
            for f in data.get("follows", []):
                if f.get("did"):
                    dids.append(f["did"])
            cursor = data.get("cursor")
            if not cursor:
                break
    return dids


async def mutuals_among(actor: str, others: list[str]) -> set[str]:
    """Of `others`, which follow `actor` back (i.e. are mutuals).

    Uses app.bsky.graph.getRelationships (max 30 subjects/call), so this is a
    couple of calls over the small friends set, not a full followers crawl.
    """
    back: set[str] = set()
    if not others:
        return back
    async with httpx.AsyncClient(timeout=10) as client:
        for i in range(0, len(others), 30):
            chunk = others[i : i + 30]
            try:
                r = await client.get(
                    f"{PUBLIC_APPVIEW}/xrpc/app.bsky.graph.getRelationships",
                    params=[("actor", actor), *[("others", o) for o in chunk]],
                )
                r.raise_for_status()
                data = r.json()
            except httpx.HTTPError:
                continue
            for rel in data.get("relationships", []):
                # followedBy present => `did` follows `actor` back.
                if rel.get("did") and rel.get("followedBy"):
                    back.add(rel["did"])
    return back


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


