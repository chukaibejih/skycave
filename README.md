# Skycave

> Bluesky-native real-time multiplayer game hub. Play with anyone, anywhere. No account required.

Pick a game → create a room → post the invite link to Bluesky → your opponent
taps in → play → share the score card. Fast, casual, mobile-first.

This repo contains the **Phase 1 (MVP)** implementation: full project scaffold,
WebSocket room system, AT Protocol identity + guest mode, and three games -
**GeoGuess 1v1**, **Color Clash**, and **Flag Rush**.

```
skycave/
  backend/    FastAPI · WebSockets · Redis · PostgreSQL   (game server)
  frontend/   Next.js 15 · Tailwind v4 · Framer Motion    (web client)
```

## Architecture at a glance

- **Game logic is 100% server-authoritative.** Clients only send raw actions
  (a tapped color, a typed country, a globe coordinate). The server validates,
  scores, and broadcasts results. The current round's answer is never sent to
  clients until the round resolves.
- **Live room state lives in Redis** as a single JSON document per room, so a
  client refresh or reconnect rehydrates the in-progress game from a single
  `ROOM_STATE` snapshot. PostgreSQL stores durable records (users, finished
  games, the room anchor for invite previews).
- **WebSockets** drive the room lifecycle. The client auto-reconnects with
  backoff and on tab-foreground / network-online, transparently resuming.
- **Identity = AT Protocol DID** for Bluesky users; guests get a temporary
  `guest:<id>` identity and are never persisted.

See [backend/README.md](backend/README.md) and
[frontend/README.md](frontend/README.md) for details.

## Quick start (local)

You need Docker (for Redis + Postgres) and Node 20+.

### 1. Backend

```bash
cd backend
cp .env.example .env            # defaults work for local docker-compose
docker compose up --build       # api on :8000, with redis + postgres
# → http://localhost:8000/health , http://localhost:8000/docs
```

Or run the API on the host against just the datastores:

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
# point DATABASE_URL / REDIS_URL at your redis+postgres, then:
uvicorn app.main:app --reload
```

### 2. Frontend

```bash
cd frontend
cp .env.local.example .env.local     # points at localhost:8000
npm install
npm run fetch:assets                 # bundles flag SVGs + globe texture (one-time)
npm run dev                          # → http://localhost:3000
```

> `fetch:assets` and the flag dataset are already committed, so this is only
> needed on a fresh checkout or when changing the country list.

## WebSocket protocol

JSON messages `{ "type": EVENT, "data": {...} }` over `WS /ws/{room_id}?token=`.

| Direction | Events |
|-----------|--------|
| server → client | `ROOM_STATE`, `PLAYER_JOINED`, `GAME_START`, `ROUND_START`, `PLAYER_ACTION`, `ROUND_RESULT`, `GAME_END`, `PLAYER_DISCONNECTED`, `ERROR` |
| client → server | `READY`, `ACTION`, `REMATCH_REQUEST` |

Defined once in [backend/app/websocket/events.py](backend/app/websocket/events.py)
and mirrored in [frontend/lib/types.ts](frontend/lib/types.ts).

## Verification (what was actually run)

Two end-to-end tests run against a live backend (Redis + Postgres in Docker):

- `backend/tests/e2e_ws.py` - two guests play a full **Color Clash** game.
  Asserts `GAME_START → 10×ROUND_START → 10×ROUND_RESULT → GAME_END` and that
  server-computed scores are consistent. **PASS** (10-0, faster player wins each
  race).
- `backend/tests/e2e_reconnect.py` - a **GeoGuess** game where player 2's socket
  is dropped mid-game and reconnects. Asserts the `ROOM_STATE` snapshot restores
  status + round + scores, and that the secret target never leaks. **PASS.**

```bash
# with the backend running on :8012
API=http://127.0.0.1:8012 python backend/tests/e2e_ws.py
API=http://127.0.0.1:8012 python backend/tests/e2e_reconnect.py
```

See [DEVIATIONS.md](DEVIATIONS.md) for decisions that depart from the spec.

## Phase plan

- **Phase 1 (this repo):** OAuth + guest, WS rooms, GeoGuess / Color Clash /
  Flag Rush, invite + share text, client-side score card, mobile UI.
- **Phase 2:** Word Duel, Draw & Guess, Tile Takeover; stats page; game history;
  leaderboards.
- **Phase 3:** Number Rush, Reaction Grid, Outline Quiz, Chain Words; rematch;
  spectator mode; push notifications.
