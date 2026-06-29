# Skycave — Implementation Spec
> Bluesky-native casual multiplayer game hub. Play with anyone, anywhere. No account required.

---

## 1. Product Overview

A web-based real-time multiplayer game hub where Bluesky is the social layer. Users post invite links to Bluesky, opponents click and join instantly. Games are fast, casual, and mobile-first. No registration wall.

**The loop:**
1. User opens the hub → picks a game → creates a room
2. App generates a short invite link
3. User posts to Bluesky: "anyone want to play? [link]"
4. Opponent clicks link → picks guest or Bluesky login → game starts
5. After game → both players see a shareable score card → post to Bluesky

---

## 2. Identity Model

### Bluesky User
- Login via AT Protocol OAuth (atproto-oauth)
- Pulls: avatar, display name, handle (e.g. @chukaibejih.bsky.social)
- Profile shown in-game as their Bluesky identity
- Game history + stats saved
- Can create rooms and receive challenge notifications

### Guest
- Picks a temporary display name on join
- Auto-generated avatar (initials + color)
- No history saved
- Full game access — no friction on invite link click

---

## 3. Game Catalog

**Design principle:** All games are procedurally generated or player-driven. No fixed question banks means no content exhaustion — the games stay fresh indefinitely.

### Procedural / Infinite (no data needed)

- **Color Clash** — the word "RED" appears written in blue ink, first to tap the correct ink color wins. Classic Stroop effect. Pure cognitive speed, infinite rounds. (Launch game.)
- **Word Duel** — both players receive the same 6 random letters, race to form the longest valid word. Skill-based, infinite letter combinations.
- **Number Rush** — a target number appears, use 4 given numbers and basic math to hit it first. Like Countdown. No content to exhaust.
- **Reaction Grid** — a grid of tiles lights up in a sequence, both players must reproduce it from memory. Difficulty scales each round. Pure reflex and memory.
- **Tile Takeover** — small grid, players alternate claiming tiles to control the most territory. Zero-data strategy game, every board plays differently.

### Low Data / High Longevity

- **GeoGuess 1v1** — tap a location on a 3D globe, closest to the target wins the round. 5 rounds. (Launch game.) Infinite variation from coordinates alone.
- **Flag Rush** — a flag appears, first to name the country wins the point. ~195 flags randomized each game, high round count before any repetition. 10 rounds.
- **Outline Quiz** — a country or continent outline appears, first to name it wins. ~195 entries, randomized, very replayable. 10 rounds.
- **Draw & Guess 1v1** — one player draws a word, the other guesses. Roles alternate. Word list is common vocabulary — broad enough to feel endless.
- **Chain Words** — last letter of a word becomes the first letter of the next. First to hesitate, repeat, or fail loses. Entirely player-generated, no data needed.

**Launch with:** GeoGuess 1v1 + Color Clash + Flag Rush.
**Phase 2:** Word Duel + Draw & Guess + Tile Takeover.
**Phase 3:** Number Rush + Reaction Grid + Outline Quiz + Chain Words.

---

## 4. Core User Flows

### Flow A: Host creates a game
```
Home → Select Game → Create Room → Get Invite Link → Post to Bluesky
```

### Flow B: Guest joins via link
```
Click invite link → "Play as guest or login with Bluesky" → Enter name (if guest) → Join room → Game starts when host is ready
```

### Flow C: Post-game
```
Game ends → Results screen → Score card (shareable image/text) → "Post to Bluesky" button → Next game / Rematch
```

---

## 5. Tech Stack

### Frontend
- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS v4
- **Animation:** Framer Motion (subtle, purposeful — not decorative)
- **Globe rendering:** globe.gl or react-globe.gl (for GeoGuess)
- **Auth:** @atproto/oauth-client-browser (AT Protocol OAuth)

### Backend
- **Runtime:** FastAPI (Python)
- **Real-time:** WebSockets via FastAPI WebSocket endpoints
- **Room management:** Redis (room state, player presence, game state)
- **Session/auth:** JWT + AT Protocol DID verification
- **Database:** PostgreSQL (user profiles, game history, stats)
- **Queue/background:** Redis + Celery (for Bluesky autoposter)

### Infrastructure
- **Hosting:** DigitalOcean (App Platform or Droplet — consistent with your existing stack)
- **Redis:** DigitalOcean Managed Redis
- **DB:** DigitalOcean Managed PostgreSQL
- **Media/OG images:** Cloudflare R2 (score card images for sharing)

### Bluesky Integration
- AT Protocol OAuth for login
- Score card post via @atproto/api (post on behalf of logged-in user)
- Invite link embedded in post as card preview (Open Graph meta tags)

---

## 6. Architecture

### Room Lifecycle (WebSocket)
```
Client connects → WS handshake → Joins room by room_id
Server: room state in Redis hash
  - room:{id}:state → waiting | in_progress | finished
  - room:{id}:players → [player1, player2]
  - room:{id}:game → {game_type, round, scores, current_question}

Events (server → client):
  PLAYER_JOINED, GAME_START, ROUND_START, PLAYER_ACTION,
  ROUND_RESULT, GAME_END, PLAYER_DISCONNECTED

Events (client → server):
  READY, ACTION (tap, answer, buzz), REMATCH_REQUEST
```

### API Routes
```
POST /auth/bluesky/callback     — AT Protocol OAuth callback
GET  /rooms/{id}                — Room details (for invite link preview)
POST /rooms                     — Create room
POST /rooms/{id}/join           — Join room (guest or user)
GET  /games                     — Available games list
GET  /users/{did}/stats         — Player stats (Bluesky DID as ID)
POST /share/scorecard           — Generate shareable score card image
WS   /ws/{room_id}              — WebSocket connection
```

---

## 7. Design System

### Visual Direction
Inspired by antigravity.google — dark, premium, floating-in-space feel. But warmer and more playful. Not cold tech. Think: **midnight arcade**.

### Color Palette
```
--bg-base:        #0A0A0F   /* near-black, slight blue tint */
--bg-surface:     #13131A   /* card/panel backgrounds */
--bg-elevated:    #1C1C28   /* modals, overlays */
--accent-primary: #6C63FF   /* electric violet — CTA, active states */
--accent-glow:    #6C63FF33 /* violet glow for ambient effects */
--accent-warm:    #FF6B6B   /* coral — player 2, danger, energy */
--text-primary:   #F0F0FF   /* off-white with slight blue */
--text-secondary: #8888AA   /* muted, for labels and metadata */
--success:        #4FFFB0   /* mint green — correct answers, wins */
--border:         #2A2A3A   /* subtle borders */
```

### Typography
- **Display:** Space Grotesk (bold, geometric — game titles, scores, big numbers)
- **Body:** Inter (readable, clean — instructions, labels, UI)
- **Mono:** JetBrains Mono (room codes, handles, technical data)

### Signature Element
**The Room Portal.** When a game room is created, a glowing circular ring pulses on screen — the "portal" waiting for the opponent. When opponent joins, the ring fills and collapses into a "GO" animation. This is the one moment of visual drama. Everything else is quiet and functional.

### Layout Principles
- Mobile-first. Design for 390px wide, scale up gracefully.
- Touch targets minimum 48px.
- Bottom-heavy navigation on mobile (thumbs reach it).
- Tap interactions over hover — no hover-only states.
- Landscape mode supported for globe games.

### Component Tokens
```
border-radius: 12px (cards), 24px (buttons), 9999px (pills/badges)
spacing unit: 4px base (use multiples: 8, 12, 16, 24, 32, 48)
transition: 200ms ease-out (default), 400ms spring (game animations)
shadow: 0 0 24px var(--accent-glow) (glow effect on active elements)
```

### Key Screens

**Home / Game Hub**
- Dark hero with ambient glow in background
- Game cards in a scrollable grid (2 columns on mobile, 3+ on desktop)
- Each card: game name, player count indicator, "Play" CTA
- Logged-in: shows your handle + avatar top right
- Guest: "Login with Bluesky" subtle link

**Room / Lobby**
- Room code displayed in mono font (large)
- "Share to Bluesky" button — primary CTA
- Player slots: your card (filled) + opponent slot (pulsing ring if waiting)
- When opponent joins: both cards appear, "Ready" button activates

**In-Game**
- Minimal chrome — game takes full screen
- Score displayed top: Player 1 vs Player 2
- Round indicator subtle, top center
- Action feedback: flash green (correct) / red (wrong) / shake (wrong buzz)

**Results Screen**
- Final scores, winner declared with subtle animation
- Breakdown: round by round
- Shareable score card preview (like MapTap's format)
- CTA: "Post to Bluesky" | "Rematch" | "New Game"

**Score Card (shareable image)**
A clean visual card generated server-side. Dark background matching the app. Two player names/handles side by side. Round breakdown as a simple bar or number row. Final score large and centered. App name + link small at the bottom. No emojis, no decoration — the numbers speak.

```
┌─────────────────────────────────────┐
│                                     │
│   chukaibejih    vs    opponent      │
│                                     │
│   R1   R2   R3   R4   R5            │
│   95   72   88   60   91            │
│   61   88   44   90   28            │
│                                     │
│         406  —  311                 │
│         chukaibejih wins            │
│                                     │
│   Skycave          [link]        │
└─────────────────────────────────────┘
```

---

## 8. Bluesky Sharing Format

**Invite post (host sharing before game):**
```
up for a quick game of GeoGuess?

[invite_link]
```
Short. No hype. Let the link card do the visual work.

**Score post (after game ends):**
```
GeoGuess 1v1 · Jun 27

chukaibejih   406
opponent      311

[link]
```
Plain text, reads naturally in a feed. Looks like someone typed it, not generated it.

**Open Graph on invite link:**
- Title: "[Player] is looking for an opponent"
- Description: "[Game] · Join and play now. No account needed."
- Image: a minimal dark card with the game name, host handle, and "Join" as the only text — no busy graphics

---

## 9. Phase Plan

### Phase 1 — MVP (launch)
- [ ] AT Protocol OAuth login + guest mode
- [ ] WebSocket room system (create, join, real-time sync)
- [ ] GeoGuess 1v1 (full game loop)
- [ ] Color Clash (full game loop)
- [ ] Flag Rush (full game loop)
- [ ] Invite link + Bluesky share button
- [ ] Score card share text
- [ ] Mobile-responsive UI

### Phase 2 — Growth
- [ ] Word Duel + Draw & Guess + Tile Takeover
- [ ] User stats page (linked to Bluesky profile)
- [ ] Score card image generation (OG image via Playwright or canvas)
- [ ] Game history
- [ ] Leaderboard (weekly, by game)

### Phase 3 — Polish
- [ ] Number Rush + Reaction Grid + Outline Quiz + Chain Words
- [ ] Rematch system
- [ ] Spectator mode (watch via shared link)
- [ ] Push notifications (Bluesky DM when challenged — if AT Protocol supports it)

---

## 10. Notes for Claude Code

- All components must be mobile-first. Test at 390px.
- No hover-only states. Every interactive element must work with touch.
- WebSocket reconnection logic is required — mobile users switch networks.
- Room state must be recoverable — if player refreshes, they rejoin the room.
- AT Protocol DID is the user identifier, not email or username.
- Keep game logic on the server, not the client — prevents cheating.
- Bluesky share should open a pre-filled post composer (use `https://bsky.app/intent/compose?text=...` URL scheme).
- Score card text should be copyable even if image generation isn't ready yet.
- Environment variables: `BLUESKY_CLIENT_ID`, `DATABASE_URL`, `REDIS_URL`, `R2_BUCKET`, `JWT_SECRET`.
