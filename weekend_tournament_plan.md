# Skycave Weekend Tournament — agreed plan

> Status: **agreed, not started.** Nothing in this document has been built.
> Designed and approved 2026-07-20. All data figures below were measured
> against production on that date.

## Context

Skycave's competitive play already clusters on the weekend without anyone designing it that way. Over the last 30 days, **77 of ~98 1v1 games (79%) happened on Saturday and Sunday** (Fri 4, Sat 42, Sun 35, Mon 8, Tue 0, Wed 6, Thu 3). A weekend tournament formalises a ritual that players invented themselves.

Two realities shape the design:

- **The field is small.** 33 Bluesky accounts, 26 who have played, 11 who returned on a second day, 3 who played 4+ days. Distinct named players on recent weekend days: 5, 4, 3, 2, 3. A first tournament realistically draws **4–8 entrants**.
- **Players are spread across timezones.** US (705 sessions), Nigeria (199), UK (84), Australia (17). There is no shared prime time — the busiest hour (03:00 UTC) has 28 games from just **2 distinct hosts**. Anything requiring everyone online simultaneously excludes most of the audience.

Signup-in-advance plus published fixtures solves this: it converts an *availability* problem (be online at 8pm) into a *commitment* problem (play your match before Saturday 6pm), which is the same reason fantasy football works.

Goal: a recurring weekend event that gives committed members a reason to return, converts guests into logged-in members (59% of play is currently guests who can't be brought back), and produces public Bluesky posts that tag real people — Skycave's only distribution channel.

## Format (decided)

- **Entry**: logged-in Bluesky users only. Signups open during the week and close at **Friday 00:00 UTC or when the participant cap is reached, whichever comes first**. Once full, registration is closed to new entrants.
- **Draw**: random pairing, single elimination. Lose your series and you're out.
- **Series**: best-of-3 — first to 2 wins. Each game in a series is drawn from **all 12 games**, and every fixture (opponent + all three games) is **published up front** so players know what they face and can practise.
- **Draws within a game**: replay the same game. Cap at 2 replays, then the series is decided on total points across it.
- **Sweeps**: at 2–0 the third game is skipped.
- **Hosting alternates** between the two players across games in a series (see Fairness below).
- **No-shows**: forfeit, via check-in (below).
- **Knocked-out players** are pointed at the weekend leaderboard so their weekend isn't over at 11am.

### Check-in, not kickoff

A fixed "15 minutes then forfeit" is exploitable across timezones: whoever opens the room at their opponent's 4am collects a free walkover. Instead:

1. Both players **check in** any time during the round's window.
2. The match room opens when *both* are checked in; the standard 15-minute wait applies from that point.
3. A player who never checks in before the round deadline **forfeits**.

This still punishes ghosting, which is the point, without punishing someone for being asleep at the wrong hour.

### The self-adjusting schedule

The play window is Friday 00:00 → **Sunday 23:59 UTC** (72h). Rounds needed = `ceil(log2(field))`. The window is divided into that many round windows, computed backwards from the Sunday wall so the tournament **cannot reach Monday**:

| Signups | Rounds | Window per round |
|---|---|---|
| 3–4 | 2 | 36h |
| 5–8 | 3 | 24h |
| 9–16 | 4 | 18h |
| 17–32 | 5 | ~14h |
| 33–64 | 6 | 12h |

- A round **advances as soon as its last match resolves** — the deadline is a backstop, not a schedule.
- Published deadlines **never move earlier**. Early finishes lengthen the *next* round.
- **The participant cap is what guarantees this fits.** Because the field can never exceed the cap, the round count is bounded and the schedule always lands inside the weekend — no runtime bail-out needed.
- **Fairness floor sets the maximum allowable cap**: below ~12h a round window lands entirely inside someone's night, which puts the hard ceiling at **64 players**. Any configured cap must sit at or under that. For early tournaments the cap should be far lower than the ceiling — it is a knob per tournament, not a constant.

### Byes

Fields are rarely a power of 2. Bracket size = next power of 2; `byes = bracket_size - field`. When a player has no opponent they **pass to the next round on a random draw — pure luck, not earned**. Bye assignment happens as part of the same random pairing, so it is visibly impartial and needs no justification in the announcement post.

Players with a bye must be told clearly they are already through, not left wondering why they have no match. Note the flip side: a bye means signing up for a weekend tournament and playing nothing on day one, so the messaging matters ("you're through to Sunday" reads far better than silence).

## Work

### 1. Fix the mode-persistence bug first (prerequisite)

`_persist_game` writes `"solo" if is_solo else "versus"` (`backend/app/services/game_engine.py:735`, row built at `:770`) and `is_solo` swallows daily (`:690`). **No row has ever been written with `mode='daily'`** — confirmed in production: `select mode, count(*) from game_sessions` returns only `solo` and `versus`. The once-per-day guard in `backend/app/routers/rooms.py:72-86` is therefore a no-op.

A tournament mode threaded the same way inherits the same hole, so fix this before building on it. Persist the real mode.

### 2. Dots and Boxes: remove structural draws

`backend/app/games/dots_boxes.py:19-20` is `COLS = 4, ROWS = 5` = **20 boxes**. An even box count makes 10–10 a natural result — hence the observed **50% draw rate**. Both dimensions must be odd so a majority always exists: **`COLS = 5, ROWS = 5`** (25 boxes, ~25% longer) or `COLS = 3, ROWS = 5` (15 boxes, faster). The client renders from `board.cols`/`board.rows` (`frontend/components/games/DotsAndBoxes.tsx:65-91`) with nothing hardcoded, so this is server-side only. Verify the AI heuristics still behave on the new board.

### 3. Announcement account

The blocker was that the server cannot post to Bluesky — `backend/app/services/bluesky_auth.py` only reads profiles, and `backend/app/services/sharing.py` just builds `intent_url` for a human to click. But posting as a **first-party account we own** doesn't need the user OAuth write + DPoP build: an app password with `com.atproto.server.createSession` → `com.atproto.repo.createRecord` is enough.

This is the highest-leverage piece, because **tagging players in fixture posts turns Bluesky into the push-notification channel Skycave doesn't have**. Posts needed: signups open, bracket + schedule reveal, each fixture (tagging both players), results, champion.

Tag only participants in their own fixtures. Wider tagging reads as spam and gets the account muted, which kills the channel.

### 4. Tournament core (backend)

- **Model**: tournaments, entrants, matches (round, bracket slot, both players, series games, per-game results, winner, deadline, check-in state). Reuse `game_sessions` for the actual plays — it is timestamped and indexed on `created_at` (`backend/app/models/game_session.py:47`).
- **Mode**: thread `"tournament"` exactly where `"daily"` already goes — `backend/app/services/room_manager.py:68`, `game_engine.py:110`, and the `mode in ("solo","daily")` checks (`:91,233,690,753`).
- **Rooms**: a match creates a real room and an invite link, reusing the existing room + invite flow rather than a parallel path.
- **Deadlines**: follow `backend/app/services/room_expiry.py:57-72,112` — in-process timer + Redis TTL as source of truth + `ensure_fresh()` re-deriving state on read, so a restart can't lose a deadline. There is no scheduler in this codebase and this plan does not add one; round boundaries are enforced by comparison-on-read.
- **Bracket engine**: random draw, random byes, advancement, forfeit-on-deadline, series resolution (2 wins, replay-on-draw, sweep).
- **Cap enforcement**: `max_players` per tournament, checked when a signup lands. Two people hitting the last slot at once must not both get in, so the check and the insert need to be atomic rather than read-then-write.

### 5. Frontend

- Tournament page: signup, published bracket with fixtures and their three games, per-round deadlines, check-in, live results.
- Entry point on the hub (`frontend/app/page.tsx`); `ModeChooser` at `:351-401` currently only renders 1v1 and Solo and never passes `"daily"` despite the plumbing existing — worth fixing alongside.
- Reuse the 409-with-message → dedicated screen pattern in `frontend/app/play/[game]/page.tsx:88-92` for "signups closed" / "not your round yet".

### 6. Fairness

The broadcast fix shipped 2026-07-20 (`backend/app/websocket/manager.py`) removed a systematic ordering bias, but the host still arrives with a warmer client than the joiner. Pooled host win rate was 63.4%, and 78.9% in RACE games. In a tournament this becomes a legitimacy problem, so **alternate hosting across games in a series** and re-measure host win rate on tournament matches specifically.

## Pre-flight

**Reaction Grid and Mad Math have never been played as 1v1 — zero games, ever.** All 12 games are in the pool, so play each of those head-to-head once before the first bracket. Their competitive debut should not be someone's tournament exit.

## Verification

- **Mode persistence**: play a daily and a tournament game, confirm `game_sessions.mode` records each correctly (this is exactly what is broken today).
- **Dots and Boxes**: simulate many AI-vs-AI games on the new board and assert **zero draws**; confirm the client renders 5×5 without layout changes.
- **Scheduler**: unit-test round-count and deadline derivation for fields of 2–64, asserting the final deadline never passes Sunday 23:59 and that early completion advances without moving published deadlines earlier.
- **Bracket**: simulate full tournaments at N = 3, 5, 6, 8, 16 — verify bye assignment, forfeits, replay-on-draw, sweeps, and that exactly one champion emerges.
- **Cap**: fire concurrent signups at the last remaining slot and assert the field never exceeds `max_players`, and that entrant number `cap + 1` is cleanly refused rather than erroring.
- **End-to-end**: run a real 4-player tournament with 4 accounts against a tunnel before announcing one publicly.
- **Announcement account**: post to a private/test account first; confirm tagging renders correctly and the post links back to the fixture.

## Not in v1

Double elimination or a consolation bracket (knocked-out players go to the weekend leaderboard instead); seeding by skill (the draw is random); prizes; guest entry; server-side posting *as users* (only the first-party Skycave account posts).

## Honest risk

A tournament is a **retention** mechanic — it gives people who already return a reason to return harder. It will not bring new people in by itself, and with 11 members who have played on two or more days, the first few will be small. That is survivable if the framing matches the size ("the first one," not "the championship"), but the underlying constraint is audience, and this plan does not solve that.
