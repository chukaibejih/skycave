# The Cave — Implementation Plan

Working plan for building The Cave (see `the_cave_spec.md` for the product spec).
Branch: `the-cave`. This file tracks decisions and the build order. No em dashes
anywhere, per the spec.

## Locked decisions

- Async first. No guests. Bluesky required at every entry point.
- Notepad: append-only thread (immutable, timestamped, role-labeled entries). No live co-edited document.
- Answer matching: exact, normalized (lowercased, trimmed, whitespace-collapsed).
- Real-time: polling is the source of truth (30s, pause on blur). A WebSocket layer is a latency-only upgrade, presence-gated, that pokes the client to poll now. Socket dropping degrades silently to polling.
- Scope: full Phase 1.
- Matchmaking: a new claimer joins the oldest room still waiting for a Solver B; only if none is waiting do they open a fresh room as Solver A.
- Verdict: when one solver confirms, the answer text freezes. If the partner edits it, both confirmations clear and each must confirm again.
- Architect visibility: counts and status only (attempts, solved, failed, time to solve). Never the solvers' notepad or suspicion board content.
- Images: unguessable public R2 URLs.
  - Flag: a shared or leaked image URL is readable by anyone. Acceptable for MVP because paths are random, but it is an honor-system boundary, not enforced. Upgrade path: signed or access-checked URLs.

## Data model (new Postgres tables, `cave_` prefixed)

- cave_cases: id, architect_did, title, premise, difficulty, case_type, answer_normalized, correct_text, wrong_text, allow_resubmit, suspicion_options (JSON list of the suspects/leads the board offers), status (draft | published | archived), created_at, published_at. Denormalized counters: attempts, solves, fails (incremented at write so browse and dashboards never run COUNT()).
- cave_evidence: id, case_id, type (MVP: text | image), content (text or R2 url), assignment (A | B | both), is_red_herring, order.
- cave_rooms: id, case_id, solver_a_did, solver_b_did (null until joined), status (waiting | active | solved | failed), verdict_answer, a_confirmed, b_confirmed, created_at, solved_at.
- cave_notepad: id, room_id, solver_role (A | B), solver_handle, content, created_at. Append-only.
- cave_suspicion: room_id, option_key, status (pinned | ruled_out | flagged), updated_by_role, updated_at. Upsert per option.

Migrations follow the existing pattern: create_all on startup plus idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for anything added later.

## The secrecy invariant (enforced server-side, tested explicitly)

- GET /cave/rooms/{id} derives the role from the requester's DID and returns only that role's evidence (their private cards plus shared cards), the notepad, the suspicion board, the verdict state, and partner meta as a count only. It never ships the answer, the other solver's private cards, or red-herring flags.
- The full reveal (every card plus the answer) is returned only after the room resolves.
- Architect endpoints return counts and status. Never room contents.

## API routes (all under `/cave/`, all behind Bluesky auth)

Builder (architect):
- POST   /cases                      create a draft
- PATCH  /cases/{id}                  update a draft
- POST   /cases/{id}/evidence         upload an image evidence card (returns R2 url)
- POST   /cases/{id}/publish          run the publish checklist and go live

Solve:
- GET    /cases                       browse published cases (filters)
- GET    /cases/{id}                  public preview only (title, premise, difficulty, counts)
- POST   /cases/{id}/rooms            claim a spot (atomic: join oldest waiting room, else create)
- GET    /rooms/{id}?since={cursor}   role-filtered room state, delta since cursor, ETag / 304
- POST   /rooms/{id}/notepad          append a note
- PATCH  /rooms/{id}/suspicion        set an option's status
- POST   /rooms/{id}/confirm          confirm verdict (locks answer; partner edit clears both)
- GET    /rooms/{id}/reveal           full reveal, only after the room resolves

Dashboards:
- GET    /architect/{did}/cases       architect dashboard (counts and status)
- GET    /solver/{did}/rooms          solver dashboard (active, waiting, submitted)

## Real-time sync

- Polling: every 30s while the tab is active, paused on blur and resumed on focus. `?since={cursor}` returns only new notepad entries, changed suspicion options, and verdict state. ETag with 304 when nothing changed.
- WebSocket upgrade: `/cave/ws/{room}`, presence-gated via a Redis heartbeat set (room_id to present DIDs, TTL). When both solvers are present it pushes a "poke" and the client does an immediate delta poll. One sync path underneath both. If the socket drops, the experience falls back to 30s polling with no visible change.

## Build order (dependency and risk first, even within full Phase 1)

- [ ] 1. Data model and migrations.
- [ ] 2. Backend core: create and publish a case; atomic claim and matchmaking; role-filtered room GET; notepad append plus delta; suspicion upsert; verdict lock, confirm, and resolve; reveal; denormalized counters. Secrecy and matchmaking live here and get adversarial tests first.
- [ ] 3. Sync: delta plus ETag, then WebSocket presence and poke.
- [ ] 4. Cave Builder: case setup; evidence builder with live asymmetry preview; case-health signal; publish checklist; publish share post.
- [ ] 5. Case Room: auth gate; evidence board; append-only notepad; suspicion board; dual-confirm verdict; reveal; verdict posts.
- [ ] 6. Cave Hub browse; architect dashboard; solver dashboard.
- [ ] 7. End-to-end test: build, publish, claim both spots from two sessions, add notes from each, dual-confirm a verdict, see the reveal.

## Cross-cutting (hold throughout)

- No guests anywhere. Every entry point checks for a connected Bluesky account and routes to auth if missing.
- The notepad write must never be lost. Retry silently on failure. Never show a returning player a blank notepad.
- Notepad timestamps display in the user's local timezone, not UTC.
- Image validation on upload: max 5MB, image types only (jpg, png, webp). Reject with a clear inline message.
- The live asymmetry preview updates only its own panel, not the whole builder.
- Mobile first. The Case Room is fully usable at 390px with no horizontal scrolling.
- Atmosphere: a warmer amber or sepia ambient background (distinct from the main hub teal and violet), paper-tinted evidence cards, a monospace notepad, and larger document-style premise text. Persistent, quiet, italic help text that never disappears.
- No em dashes in copy, code, or comments.

## Open items to revisit later (not blocking Phase 1)

- Notifications (notepad activity, verdict confirmation) are Phase 2. Must be a DM (needs the AT Proto chat scope) and debounced, never an at-mention spam. Confirm scope availability before building.
- Abandoned half-open rooms (Solver A joined, no B) accumulate under async with no expiry. Consider a soft-archive policy.
- Image URL hardening (signed or access-checked) if leakage becomes a concern.
