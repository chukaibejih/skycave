# Decisions & deviations from the spec

Things I decided that differ from, or extend, `skycave_spec.md` — and why.

## 1. Score cards are client-side downloads, not R2-hosted (per your direction)

The spec listed Cloudflare R2 for "score card images for sharing." Per your
instruction during the build, **nothing is stored server-side** — the score
card is generated in the browser ([frontend/lib/scorecard-image.ts](frontend/lib/scorecard-image.ts),
Canvas → PNG) and the user downloads it. `R2_*` env vars were removed. The
`POST /share/scorecard` endpoint returns only copyable text + a Bluesky compose
intent URL (`image_url` is always null). The Bluesky share itself uses the
`bsky.app/intent/compose?text=...` scheme as specified.

## 2. AT Protocol OAuth: Node sidecar (backend-for-frontend)

Real OAuth is implemented as a separate **Node service** (`oauth-sidecar/`) using
`@atproto/oauth-client-node` — the dev-login shortcut has been **removed
entirely**. Flow:

1. Browser → `api.skycave.space/oauth/login` (sidecar) → PAR → user's PDS.
2. PDS → `api.skycave.space/oauth/callback` (sidecar): DPoP-bound code exchange,
   verifies the DID, sets an **httpOnly `skycave_sid` cookie**, redirects to
   `skycave.space/oauth`.
3. Frontend calls `POST /auth/bluesky/complete` (cookie sent same-site). FastAPI
   reads the cookie, asks the sidecar's **internal-only** `GET /oauth/session`
   (shared `OAUTH_INTERNAL_SECRET`, never routed publicly — nginx returns 404 for
   `/oauth/session`) for the DID, fetches the profile, upserts the `User`, and
   mints the Skycave JWT.

Confidential client: `private_key_jwt` + **ES256**, `dpop_bound_access_tokens`,
`atproto` scope only (granular scopes not finalized). nginx routes `/oauth/*` to
the sidecar, everything else to FastAPI; only nginx is publicly exposed.

**Before deploy:** generate the ES256 keypair and set the sidecar env
(`OAUTH_PRIVATE_KEY`, `SESSION_SECRET`, `OAUTH_INTERNAL_SECRET`,
`PUBLIC_OAUTH_BASE`, `COOKIE_DOMAIN`):

```bash
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -pkeyopt ec_param_enc:named_curve | openssl pkcs8 -topk8 -nocrypt -outform pem > oauth-private-key.pem
openssl ec -in oauth-private-key.pem -pubout > oauth-public-key.pem
```

**Not yet verified live:** the interactive login round-trip requires a public
HTTPS `client_id` + a real Bluesky account, so it's verifiable only once deployed
(build, boot, metadata/JWKS, and the internal-session guard are all verified).
For local testing, use the guest flow. CORS must be set to the real frontend
origin (not `*`) in prod so the credentialed `complete` call is allowed.

### Production OAuth implementation plan (do before public deploy)

- **Server-side / backend-for-frontend (BFF):** run the OAuth flow on the
  backend, map the session to the frontend via a **session cookie**. More
  secure than the browser client, and yields longer-lived tokens to a
  confidential client.
- **Recommended lib:** `@atproto/oauth-client-node` — **Node only**. ⚠️ Our
  backend is Python/FastAPI, so first decide: (a) a small Node OAuth sidecar, or
  (b) hand-rolled atproto OAuth in Python (PAR + DPoP; no official Python OAuth
  client yet).
- Publish `client-metadata.json` at a public `https://` URL (`client_id` IS that
  URL — already served at `/auth/bluesky/client-metadata.json`).
- **DPoP mandatory** (`dpop_bound_access_tokens: true`).
- Confidential client → token auth = **`private_key_jwt`** with an **ES256** key:
  ```bash
  openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -pkeyopt ec_param_enc:named_curve | openssl pkcs8 -topk8 -nocrypt -outform pem > oauth-private-key.pem
  openssl ec -in oauth-private-key.pem -pubout > oauth-public-key.pem
  ```
- **Scopes:** use only `atproto` for now (granular scopes are rolling out but not
  finalized — don't use them in production yet).
- **Delete `POST /auth/bluesky/dev-login` entirely** — it must not exist in prod.

## 3. Single-worker backend; horizontal scaling needs Redis pub/sub

Live WebSocket connections are tracked in an in-process registry
([websocket/manager.py](backend/app/websocket/manager.py)) and round timers are
in-process `asyncio` tasks. Authoritative state is in Redis, so this is correct
and simple for one worker (the Dockerfile runs a single uvicorn process). To run
multiple replicas you'd add Redis pub/sub to fan broadcasts across workers and
move room mutation locks to a Redis lock. Documented in the relevant modules.

## 4. GeoGuess targets are a curated list of famous places

The spec says "infinite variation from coordinates alone." Rather than fully
random ocean coordinates (unsatisfying to guess), rounds pick from ~30
recognizable cities/landmarks ([games/geoguesss.py](backend/app/games/geoguesss.py)).
Scoring is great-circle distance with exponential falloff (max 5000/round). Easy
to swap for fully-random or a larger set later.

## 5. Flag Rush data is generated offline; flag assets bundled at build

- Country **names + aliases** are generated with Node's `Intl.DisplayNames`
  (194 sovereign states) — no hand-maintained list, no runtime API.
  → `frontend/scripts/generate-flags-data.mjs` → `lib/data/flags.json`
  (a copy lives at `backend/app/games/data/flags.json` for answer validation).
- Flag **SVGs** are downloaded once at build time from the `flag-icons` CDN into
  `frontend/public/flags/` (`scripts/fetch-assets.mjs`). At **runtime** they're
  served locally — no external API, per the constraint. All 194 are present.

Typed answers are normalized (accent/case/punctuation-insensitive) and a small
alias table covers common names (UK, USA, South Korea, Czechia, …).

## 6. Globe texture bundled with a graceful fallback

`GlobePicker` uses a bundled night-earth texture
(`public/textures/earth-dark.jpg`, fetched by `fetch:assets`). If it's missing,
the globe still renders as a tinted sphere with graticules — usable, just
without continents. The component probes for the texture and falls back.

## 7. Race-mode anti-cheese: lockout on wrong discrete picks

For Color Clash / Flag Rush (first-correct-wins), a **wrong tap** on a
multiple-choice option locks that player out for the round (prevents tapping all
6 colors / all 4 options). A wrong **typed** answer does *not* lock you out (so a
typo isn't fatal). If every connected player locks out, the round ends early.
Not in the spec, but necessary for fair race scoring.

## 8. Rematch routes to a fresh room

`REMATCH_REQUEST` is wired in the WS handler (both players opt in → new game in
the same room). The Results page's "Rematch" button currently creates a fresh
room of the same game type and navigates there — the simplest reliable loop for
the MVP. The in-room rematch handshake is implemented server-side and ready for
a richer Phase-3 rematch UI.

## 9. Minor structure notes

- `EXTRA` core modules (`core/config.py`, `core/database.py`, `core/redis_client.py`,
  `core/security.py`, `core/deps.py`, `core/ids.py`) were added beyond the
  spec's tree for clean separation — the spec's named files all exist where
  expected (`services/room_manager.py`, `services/game_engine.py`,
  `services/bluesky_auth.py`, `websocket/handler.py`, `websocket/events.py`,
  `games/geoguesss.py`, `games/color_clash.py`, `games/flag_rush.py`).
- `GET /users/{did}/stats` uses a `{did:path}` param because DIDs contain colons.
