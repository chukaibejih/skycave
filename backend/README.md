# Skycave backend

FastAPI game server: REST + WebSockets, Redis room state, PostgreSQL persistence.

## Run

```bash
docker compose up --build          # api :8000 + redis + postgres
# or, on the host:
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Interactive docs at `/docs`.

## Layout

```
app/
  main.py                 app wiring, lifespan (init_db + redis ping), WS route
  core/
    config.py             settings (pydantic-settings, .env)
    database.py           async SQLAlchemy engine + Base + init_db
    redis_client.py       shared async Redis client
    security.py           JWT issue/verify (sub = DID or guest:<id>)
    deps.py               auth dependencies (REST + WS)
    ids.py                room/guest id generation
  models/                 User, Room, GameSession (SQLAlchemy)
  schemas/rest.py         Pydantic request/response models
  services/
    room_manager.py       Redis room document CRUD + per-room async lock
    game_engine.py        round lifecycle + scoring + timers (authoritative)
    bluesky_auth.py       atproto identity resolution + client metadata
    sharing.py            Bluesky compose-intent + score text builders
  websocket/
    events.py             canonical event names (mirror of frontend/lib/types)
    manager.py            in-process socket registry + broadcast
    handler.py            WS endpoint: connect, lifecycle, reconnect
  games/
    base.py               BaseGame (race / simultaneous modes)
    geoguesss.py          GeoGuess 1v1 (simultaneous, distance scoring)
    color_clash.py        Color Clash (race, Stroop)
    flag_rush.py          Flag Rush (race, typed + multiple-choice)
    registry.py           game_type -> instance
    data/flags.json       country names + aliases (generated offline)
tests/
  e2e_ws.py               full game lifecycle (live server)
  e2e_reconnect.py        reconnection + state recovery (live server)
```

## How a game runs (server-authoritative)

1. Both players send `READY` → `game_engine.start_game` → `GAME_START`.
2. `start_round` generates `(public, secret)`; broadcasts `ROUND_START` with
   *public* only; schedules a round-timeout task.
3. `ACTION` → `handle_action` validates against the secret:
   - **race** (Color Clash, Flag Rush): first correct answer wins the point and
     resolves the round; wrong discrete picks lock the player out for the round.
   - **simultaneous** (GeoGuess): collect both guesses, then score by distance.
4. `_finish_round` → `ROUND_RESULT` (reveals the answer + cumulative scores),
   schedules the next round or `end_game`.
5. `end_game` → `GAME_END`, persists `GameSession`, updates non-guest stats.

Round state and timers are in-process (single worker); the authoritative
document is in Redis under `room:{id}`, so reconnects rehydrate via `ROOM_STATE`.

## Deploy (DigitalOcean droplet)

`nginx.conf` proxies `api.skycave.space` → the container on `127.0.0.1:8000`
with the WebSocket `Upgrade`/`Connection` headers and long read timeouts for
idle game sockets. Run `certbot --nginx -d api.skycave.space` for TLS.
