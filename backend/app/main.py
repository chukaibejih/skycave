from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import init_db
from app.core.redis_client import close_redis, get_redis
from app.routers import (
    internal,
    admin,
    auth,
    cave,
    feedback,
    games,
    leaderboard,
    rooms,
    share,
    users,
)
from app.websocket.handler import websocket_endpoint

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Warm the Redis connection so the first request doesn't pay the cost.
    await get_redis().ping()
    yield
    await close_redis()


app = FastAPI(title="Skycave API", version="0.1.0", lifespan=lifespan)

# Auth is bearer-token based (no cookies), so a wildcard origin is safe for
# local/tunnel testing. With "*" we must disable credentials per the CORS spec.
_origins = settings.cors_origin_list
_wildcard = "*" in _origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _wildcard else _origins,
    # Allow cloudflared quick tunnels (phone/laptop testing) without hardcoding
    # the URL, which changes on every tunnel restart. Never matches prod origins.
    allow_origin_regex=None if _wildcard else r"https://[a-z0-9-]+\.trycloudflare\.com",
    allow_credentials=not _wildcard,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(games.router)
app.include_router(rooms.router)
app.include_router(users.router)
app.include_router(share.router)
app.include_router(admin.router)
app.include_router(feedback.router)
app.include_router(leaderboard.router)
app.include_router(cave.router)
app.include_router(internal.router)


@app.get("/health", tags=["meta"])
async def health() -> dict:
    return {"status": "ok"}


@app.websocket("/ws/{room_id}")
async def ws(ws: WebSocket, room_id: str, token: str | None = Query(default=None)):
    await websocket_endpoint(ws, room_id, token)
