# Skycave Weekend Tournament - build brief

> The section below is the user's brief, saved verbatim as the guiding
> document for implementation. The architecture it refers to lives in
> `weekend_tournament_plan.md` and is not superseded by this file.
> Reconciliation notes (things that changed since the brief was written) are
> at the bottom, clearly marked.

---

## The brief (as written)

We are building the Skycave Weekend Tournament. Read the tournament plan document already in the codebase before writing a single line of code. Everything architectural is already decided there: bracket logic, check-in system, self-adjusting schedule, cap enforcement, announcement account. Do not deviate from it. This prompt is about implementation detail, UI, and UX.

### 1. Tournament registration page

This is the most important screen. Regular people will land here from a Bluesky post. It must feel like an event, not a form.

The page has one job: get someone excited enough to sign up. Design it accordingly. Think Premier League Fantasy, not a signup sheet.

- Hero section with the tournament name, the game being played this weekend, and a large countdown timer to the registration deadline. Deadline is **Thursday 08:00 AM Los Angeles time (Pacific)**. The timer shows days, hours, minutes, seconds. It pulses gently. It feels alive.
- Below the timer: the bracket size and how many spots are left. "6 of 8 spots remaining" updates in real time. When the last spot fills, the button changes to "Registration closed", no refresh needed.
- Sign up requires Bluesky login only. No guests. One button: "Enter the tournament." Tapping it triggers the Bluesky OAuth flow if not already logged in.
- After signing up, the page does not go blank or show a generic success message. It transforms into a **personal dashboard for that player**:
  - "You're in. Good luck." as the headline
  - Their Bluesky avatar and handle displayed prominently
  - A persistent friendly message that stays on the page: something like "Your bracket and opponent will be revealed when registration closes. Until then, go warm up in the game hub." with a direct link to the game hub
  - A live countdown to when fixtures are revealed (registration close = fixture reveal)
  - Their confirmed game list for the weekend, all three games in their potential series, shown as cards with the game name and a "Practice" button that takes them directly into solo mode for that game
  - Check-in status, not yet active until their round opens, but shown as "Check-in opens Friday 00:00 UTC" so they know what's coming

### 2. Live bracket page

This is the public face of the tournament. Anyone on Bluesky should be able to open this link and follow along without logging in.

- A proper bracket visualization. Not a table, not a list. A real bracket: left side, right side, winners meet in the middle.
- Each player slot shows their Bluesky avatar (fetched from AT Protocol), their display name, and their handle. Not a username string. Their actual identity.
- Match slots show the three games in that fixture as small game icons or pills below the player names.
- Results update live as matches are played. When a match is decided, the winner's slot lights up and moves forward in the bracket. The loser's slot greys out.
- A round deadline countdown is visible on each active round: "Round 1 closes in 14h 32m."
- Matches that are in progress show a live indicator, a subtle pulse on the match slot.
- Byes are shown clearly: "Bye, advances to Round 2" so players with no Round 1 match don't wonder what happened.
- The bracket page is shareable. The URL is the tournament URL. Posting it to Bluesky shows a good Open Graph preview: tournament name, current status, who's left.

### 3. Match room integration

When both players have checked in, the match room is created automatically. The player sees:

- Who their opponent is: avatar, name, handle
- The three games in their series in order
- Which game they are currently on
- Their series score so far (e.g. "1 - 0, one more win takes it")
- A "Start Game 2" button that creates the room for the next game in the series automatically. They should never have to go back to the hub and create a room manually

### 4. Post-tournament

When the bracket resolves to a champion:

- The bracket page shows the champion with a distinct visual treatment, not just a name at the top, something that feels like a moment
- The Skycave announcement account posts to Bluesky automatically, tagging the champion: "Skycave Weekend Tournament, [name] wins. [bracket link]"
- All participants get a result post tagging them: their finish position, their record, a link back

### Games in the pool

Exclude GeoGuess 1v1, Flag Rush, and Outline Quiz from tournament play for this first one. The remaining eligible games are: Tile Takeover, Connect 4, Word Hunt, Color Clash, Word Duel, Clay, Reaction Grid, Dots and Boxes, Mad Math.

Before building, note from the tournament doc: Reaction Grid and Mad Math have zero 1v1 games ever played. Do not include them in the pool until they have been tested head-to-head. That leaves: Tile Takeover, Connect 4, Word Hunt, Color Clash, Word Duel, Clay, Dots and Boxes.

Each fixture's three games are drawn randomly from this pool at bracket generation time. All three are published upfront so players know what they face.

### UI and UX non-negotiables

- This is built for regular people on Bluesky, not developers. Every screen must be immediately understandable without reading any instructions.
- Mobile first, 390px minimum. The bracket visualization must work on a phone screen. Horizontal scrolling is acceptable for the bracket only, nothing else.
- Every Bluesky avatar must load. If it fails to fetch, show a fallback with their initials, never a broken image.
- Countdown timers must update in real time without page refresh.
- Live updates (spots remaining, bracket results, match status) must update without page refresh. Use polling at 30 second intervals as the default, WebSocket upgrade when available.
- The registration page, bracket page, and match experience must feel like they belong to the same product: same design tokens, same typography, same dark theme with violet and coral accents from the existing Skycave design system.
- No em dashes anywhere in copy, code, or comments.
- Friendly, human copy throughout. No "your registration has been confirmed." Write like a person. "You're in." is better than "Registration successful."
- Every interactive element must have a minimum 48px touch target.

### First-player advantage fix (prerequisite)

Before building the tournament, fix the host win rate bias in Color Clash and Flag Rush. The data shows Color Clash at 81% and Flag Rush at 83% first-player win rate. These are in the excluded list but the underlying bias may affect other games too. Investigate and fix the root cause in the WebSocket event timing before any tournament match is played.

### Verification before announcing publicly

- Run a complete 4-player test tournament with 4 real accounts against a tunnel. Every round must complete, the bracket must advance correctly, the champion must be crowned, and the announcement post must fire.
- Confirm bracket URL shows correct Open Graph preview when pasted into Bluesky.
- Confirm countdown timers are showing Los Angeles time correctly accounting for daylight saving.
- Confirm avatar fetching works for both .bsky.social and .blacksky.app handles.
- Test the "last spot" race condition: two people hitting register simultaneously when one spot remains. Only one should get in.

---

## Reconciliation notes (added during planning, 2026-07-23)

Things that changed since the brief was written. None of these alter the
architecture; they change what goes in the pool and what still needs doing.

1. **The first-player prerequisite is already done.** The root cause was
   `ConnectionManager.broadcast` awaiting each player's send in turn, walking
   the room dict in insertion order, so the host (who connects first) was
   always served first. Fixed 2026-07-20 by encoding once and fanning out with
   `asyncio.gather` (`backend/app/websocket/manager.py`), measured 3.76ms ->
   0.02ms delivery gap. Production data since:
   **host win rate 63.4% before the fix, 53.2% after** (79 decisive games).
   Per-game rates after the fix are all sub-20-game samples and are noise.

2. **Uno is missing from the brief's pool** and should almost certainly be in
   it. It launched 2026-07-22, is the most-played game since (76% of all
   plays), and its 1v1 path is verified end to end. It is turn-based with
   hidden state and produces a decisive winner every time.

3. **Color Clash contradiction in the brief.** It is named as needing a bias
   fix and described as "in the excluded list", but it appears in the brief's
   own final pool. It needs an explicit in/out decision.

4. **Dots and Boxes still has structural draws.** `COLS = 4, ROWS = 5` = 20
   boxes, an even count, so 10-10 is a natural result (observed 50% draw rate).
   With best-of-3 and replay-on-draw this would trigger replays constantly.
   Prerequisite #2 in the plan (odd board) is still unbuilt.

5. **Registration deadline moved.** The plan says signups close Friday 00:00
   UTC; the brief says Thursday 08:00 Los Angeles time. Those differ by about
   9 hours, which creates a gap between fixture reveal (Thursday morning PT)
   and the play window opening (Friday 00:00 UTC). That gap is arguably a
   feature (practice time against published fixtures) but it is a deliberate
   change from the plan and should be confirmed.

6. **Outstanding dependencies from the plan, both unbuilt or unmerged:**
   - Prerequisite #1, the mode-persistence bug: `_persist_game` collapses any
     mode to "solo"/"versus", so a "tournament" mode would never be recorded.
   - The announcement account is built and verified but sits unmerged on
     `feat/announcements`, blocked on a Bluesky app password being placed on
     the droplet. Fixture, result and champion posts all depend on it.

---

## Decisions taken 2026-07-23 (these resolve the notes above)

- **Uno is IN the pool.** Final pool is 8 games: Tile Takeover, Connect 4,
  Word Hunt, Color Clash, Word Duel, Clay, Dots and Boxes, Uno.
- **Color Clash is IN.** The bias it was flagged for was the global broadcast
  bug, now fixed; its post-fix number is a 4-game sample.
- **Dots and Boxes board becomes 5x5** (25 boxes, odd) so draws are structurally
  impossible, rather than dropping the game.
- **Registration closes Thursday 08:00 America/Los_Angeles**, which is also the
  fixture reveal. The play window still runs Friday 00:00 UTC to Sunday 23:59
  UTC, so entrants get roughly 9 hours with published fixtures to practise.
- **First-player bias needs no further work.** Root cause fixed and verified in
  production (63.4% -> 53.2%).

### Build phases

- **Phase 0** prerequisites: mode persistence, Dots and Boxes 5x5, announcement
  account merged and credentialed.
- **Phase 1** tournament engine (backend, headless): models, draw, byes,
  series resolution, self-adjusting schedule, atomic cap. Proven by simulating
  N=3/5/6/8/16 before any UI exists.
- **Phase 2** registration page + personal dashboard.
- **Phase 3** public live bracket page (+ Open Graph).
- **Phase 4** check-in, match room and series flow.
- **Phase 5** champion moment and automated Bluesky posts.
- **Phase 6** full verification: 4-player tunnel tournament, OG preview, DST,
  avatar fetch on both PDS types, last-spot race.
