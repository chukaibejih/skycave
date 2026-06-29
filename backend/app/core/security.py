"""JWT issuing/verification for both Bluesky users and guests.

The token subject is the canonical identity:
  - Bluesky users: their AT Protocol DID (e.g. did:plc:abc123)
  - Guests:        a generated guest id (e.g. guest:8f2c...)

`is_guest` distinguishes the two so downstream code never persists guests.
"""
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt

from app.core.config import settings


def create_token(
    subject: str,
    *,
    is_guest: bool,
    handle: str,
    display_name: str,
    avatar_url: str | None = None,
    extra: dict[str, Any] | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "is_guest": is_guest,
        "handle": handle,
        "display_name": display_name,
        "avatar_url": avatar_url,
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_admin_token() -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": "admin",
        "admin": True,
        "iat": now,
        "exp": now + timedelta(minutes=settings.admin_token_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
    except JWTError:
        return None
