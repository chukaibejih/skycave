---
title: "Skycave and the Open Gaming Graph of the Atmosphere"
description: "Vision, architecture, protocol concepts, and roadmap for evolving Skycave from an AT Protocol-connected game platform into an open gaming graph."
status: "Vision / Experimental"
last_updated: "2026-08-18"
---

# Skycave and the Open Gaming Graph of the Atmosphere

## Executive Summary

Skycave should not merely integrate with AT Protocol.

It has a credible opportunity to help define what gaming looks like as a native application category in the Atmosphere.

The long-term idea is not:

> A website where Bluesky users play browser games.

It is not even:

> The AT Protocol gaming platform.

The more ambitious and useful framing is:

> **Skycave becomes the open gaming graph of the Atmosphere.**

Skycave would be where gaming connects:

- players
- games
- developers
- matches
- rivals
- tournaments
- achievements
- communities
- agents

The central Skycave product can remain beautiful, opinionated, fast, and centralized where centralization is useful. Live game execution, timers, anti-cheat, authoritative engines, WebSocket state, and transient gameplay should remain on purpose-built Skycave infrastructure.

AT Protocol should be used where it is strongest:

- portable identity
- durable gaming history
- interoperability
- discovery
- public social objects
- developer identity
- reusable schemas
- open indexing
- alternative views over shared facts

The architectural principle is simple:

> **Centralize execution. Decentralize identity, durable history, interoperability, and discovery.**

---

# 1. Why AT Protocol Changes the Opportunity

AT Protocol is deliberately application-agnostic.

It provides building blocks such as:

- portable decentralized identity
- user-owned repositories
- globally referenceable records
- Lexicons for application schemas
- OAuth and permissions
- repository event streams
- AppViews
- open synchronization and indexing infrastructure

The protocol does not define a universal concept of:

- game
- match
- achievement
- challenge
- tournament
- season
- rivalry

That means developers building gaming applications have room to establish useful conventions.

Skycave is already in a position to experiment with those conventions because it already has:

- AT identity
- multiple games
- solo and 1v1 play
- profiles
- game history
- rivalries
- leaderboards
- tournaments
- spectating
- achievements
- social sharing
- community participation

The opportunity is not to decentralize every gameplay packet.

The opportunity is to make gaming activity interoperable.

---

# 2. The Core Thesis

Skycave should evolve from:

```text
Skycave
   ↓
makes games
   ↓
players play them
```

toward:

```text
                 SKYCAVE NETWORK
                       │
         ┌─────────────┼─────────────┐
         │             │             │
     Identity      Competition     Discovery
         │             │             │
     Profiles       Matches         Feeds
     History        Ratings         Challenges
     Achievements   Tournaments     Social graph
         │             │             │
         └─────────────┼─────────────┘
                       │
               OPEN GAME LAYER
             /         |         \
            /          |          \
      Skycave game   indie game   community game
```

Skycave does not need to run every future game.

It can become the layer that gives games:

- identity
- competition
- records
- reputation
- discovery
- social context

---

# 3. A Proposed Skycave Lexicon Family

An experimental Skycave protocol project could begin with a small family of Lexicons:

```text
space.skycave.game.definition
space.skycave.match
space.skycave.match.result
space.skycave.playReceipt
space.skycave.challenge
space.skycave.achievement
space.skycave.achievementAward
space.skycave.tournament
space.skycave.tournament.entry
space.skycave.tournament.match
space.skycave.tournament.result
space.skycave.season
space.skycave.rating
space.skycave.rivalry
space.skycave.matchmaking.request
```

These should not all be implemented immediately.

The first objective is to discover which concepts deserve durable protocol-level representation.

A sensible starting set is:

```text
space.skycave.game.definition
space.skycave.match.result
space.skycave.achievementAward
space.skycave.challenge
```

---

# 4. Make Gaming History Belong to the Player

Today, a centralized game platform typically owns the complete record of a player's activity.

For example:

```text
Ibejih played 298 games
Ibejih has 90 1v1 wins
Ibejih earned Nemesis
Ibejih won Tournament #14
```

The long-term Skycave model should allow durable gaming artifacts to be associated with the player's AT identity.

However, this creates an important integrity problem:

> A user should not be able to publish "I scored 999999" and have that become authoritative.

The solution is to separate **ownership** from **authority**.

## Canonical result

A trusted game/referee service publishes the authoritative result:

```text
space.skycave.match.result

match: at://...
players:
  - did:plc:alice
  - did:plc:bob
winner: did:plc:alice
game: connect4
score: ...
completedAt: ...
engineVersion: ...
```

## Player receipt

The player's repository can contain a reference to the authoritative result:

```text
space.skycave.playReceipt

result: strong-reference-to-canonical-result
```

This gives us a useful principle:

> **The player owns their gaming history, while the referee certifies what happened.**

That pattern can preserve integrity without forcing all durable gaming history to live only inside Skycave's private database.

---

# 5. The Portable Gaming Profile

Skycave profiles already answer:

> Who are you inside Skycave?

The more ambitious direction is:

> Who are you as a player across the Atmosphere?

A future profile could be reconstructable from protocol records:

```text
IBEJIH

Overall
426 matches

Connect 4
102W / 93L

Uno
Best: 112

Flag Rush
Best: 29

Tournament titles
2

Achievements
Century
Nemesis
Veteran
...
```

That profile would no longer be only a Skycave account page.

It becomes a portable gaming identity.

Another application could potentially display:

- game history
- tournament titles
- achievements
- ratings
- personal bests

without being the application where those results were originally created.

---

# 6. Skycave as an API for Games

The strongest long-term platform move is not simply building more first-party games.

Skycave can eventually provide infrastructure for other games.

A developer building a browser game should not have to independently build:

- AT authentication
- accounts
- profiles
- leaderboards
- tournament infrastructure
- achievements
- social challenge flows
- result sharing
- match history

A future Skycave Game SDK might conceptually look like:

```javascript
const match = await skycave.createMatch({
  game: "com.someone.hex",
  players: [alice, bob]
})

await skycave.completeMatch({
  match,
  winner: alice,
  result: {...}
})
```

Skycave then becomes closer to an open equivalent of gaming platform services such as Game Center, Steamworks, or Xbox Live services, but built around portable AT identities.

---

# 7. Let Other Developers Publish Games

Games should eventually be able to exist independently from the Skycave monorepo.

A developer could publish:

```text
space.skycave.game.definition
```

with fields such as:

```text
name
gameId
launchUrl
icon
modes
minPlayers
maxPlayers
resultSchema
developerDID
```

Skycave could:

1. discover it
2. verify/review it
3. trust or approve the developer
4. list it inside the Skycave game dock

The game could run on the developer's own domain.

Skycave would continue to provide the shared gaming layer:

- identity
- matches
- results
- reputation
- discovery

This changes the scalability of the catalogue.

Skycave would no longer need to engineer every game itself.

---

# 8. The Social Graph as Matchmaking Infrastructure

One of AT Protocol's strongest advantages for Skycave is not decentralization by itself.

It is that people arrive with relationships.

Instead of a generic:

> Who is online?

Skycave could eventually surface:

- People you follow playing now
- 3 mutuals play Mancala
- Jae just beat your Uno record
- Someone you follow is looking for a Connect 4 opponent
- Your rival is online
- Two people you follow are in a tournament match

Skycave should not rebuild a social graph.

It should provide a gaming lens over an existing one.

---

# 9. Protocol-Level Looking for Game

A matchmaking request could become a public, expiring record:

```text
space.skycave.matchmaking.request
```

Conceptually:

```json
{
  "game": "connect4",
  "mode": "1v1",
  "createdAt": "...",
  "expiresAt": "...",
  "skillPreference": "any"
}
```

An AppView could index active requests.

Skycave might show:

> 17 people looking for games.

A Blacksky-focused surface could show:

> 4 Blacksky members are looking for a game.

A community client could surface only requests from people a user follows.

The live match itself should still run on purpose-built game servers.

The protocol is useful here for **discovery**, not latency-sensitive game execution.

---

# 10. Turn Social Feeds into Arcade Lobbies

Custom feeds can become game-discovery surfaces.

Possible Skycave feeds:

## The Arcade

Playable gaming activity from people you follow:

- challenges
- scores
- tournament entries
- record breaks
- championship wins

## Live in the Cave

Current competitive moments:

- tournament matches
- finals
- active challenge events
- major leaderboard takeovers

## Beat This

Scores from your graph that you have not beaten.

The important transition is:

```text
social post
   ↓
playable object
   ↓
game session
```

Example:

> Ray scored 31 on Flag Rush.

Tap.

You are playing Flag Rush.

The social feed becomes part of the arcade lobby.

---

# 11. Challenges as First-Class Objects

Today, a challenge can be little more than a link.

A protocol-native challenge can have a lifecycle:

```text
space.skycave.challenge
```

with references to:

- challenger
- challenged DID
- game
- score to beat, if applicable
- expiry
- accepted match
- eventual result

Lifecycle:

```text
CHALLENGE CREATED
       ↓
ACCEPTED
       ↓
MATCH
       ↓
RESULT
```

That makes possible:

- Challenges awaiting you
- Unresolved rivalry challenges
- Most challenged players
- Challenges between mutuals
- Community challenge boards

---

# 12. Portable Tournaments

Tournaments are a natural candidate for reusable protocol objects.

Possible records:

```text
space.skycave.tournament
space.skycave.tournament.entry
space.skycave.tournament.match
space.skycave.tournament.result
```

Skycave's Weekend Tournament could simply be one consumer of that format.

Other communities could run:

- Blacksky Summer Cup
- FootballSky Connect 4 Cup
- University Mancala Night
- Community Word Duel Championship

Skycave provides:

```text
Registration
   ↓
Bracket
   ↓
Matches
   ↓
Spectating
   ↓
Results
   ↓
Champion
```

The event can socially belong to the community running it.

This moves Skycave toward **competition infrastructure for AT communities**.

---

# 13. Open Trophies

Achievements should eventually be more than profile decorations.

A protocol record could represent an awarded achievement:

```text
space.skycave.achievementAward
```

Examples:

- Flag Rush World #1
- Weekend Champion
- 100 Wins
- Undefeated Tournament
- Longest Reign
- 10-Game Rivalry Streak

The award would include an issuer.

For example:

```text
issuedBy: did:plc:skycave
```

Later:

```text
issuedBy: did:plc:blacksky-community
```

or:

```text
issuedBy: did:plc:external-game-developer
```

The player profile becomes an open trophy cabinet.

The broader concept can be thought of as:

> **Open Trophies**

---

# 14. Alternative Leaderboards

Skycave should focus on publishing reliable facts.

Different services can interpret those facts differently.

One AppView might rank:

> total wins

Another:

> Elo

Another:

> only Blacksky users

Another:

> Nigerian players

Another:

> August season only

Another:

> mutuals only

The important architectural separation is:

```text
verified match facts
         ↓
different views
```

Skycave does not need to permanently own the one true interpretation of competitive data.

---

# 15. Seasons as Durable Objects

A season could itself become a referenceable protocol object:

```text
space.skycave.season
```

Example:

```text
SEASON 4
August 2027

Connect 4
Mancala
Freeze
Uno
```

Qualifying results reference the season.

Anyone could then construct:

- season standings
- player form
- game-specific rankings
- community-specific standings
- historical archives

A season could theoretically survive even if the original Skycave frontend disappears.

---

# 16. Games Should Not Need to Know Bluesky Exists

Avoid:

```text
Game
  ↓
Bluesky API
```

Prefer:

```text
Game
  ↓
Skycave Gaming Layer
  ↓
AT Protocol
  ↓
Bluesky / Blacksky / future clients
```

Bluesky is one client surface.

Blacksky is another community/client surface.

Future AT applications can become additional surfaces.

This prevents Skycave's architecture from being limited by the current feature set of a single client.

---

# 17. Public, Permissioned, and Real-Time Data

Not every game object belongs in a public AT repository.

A clean long-term boundary is:

## Public AT Data

- completed results
- achievements
- public challenges
- tournaments
- game definitions
- public player statistics
- records
- public matchmaking requests

## Private / Permissioned Data

- hidden card hands
- private invitations
- unrevealed choices
- private leagues
- moderation state
- admin state

## Real-Time Skycave Infrastructure

- WebSocket gameplay
- timers
- anti-cheat
- authoritative engines
- physics
- transient room state
- short-lived game actions

This prevents the architecture from becoming decentralization theatre.

---

# 18. An ATProto-Native Game Observer

Skycave could publish selected competitive events:

```text
match started
round won
match completed
tournament advancement
record broken
```

This creates the possibility of independent observers.

Examples:

- Skycave TV
- third-party spectator clients
- tournament tickers
- live community displays
- game analytics visualizers
- bots

The key idea is that public gaming events become machine-readable objects rather than only UI updates inside Skycave.

---

# 19. AI Agents as Gaming Citizens

This should remain a future possibility, not a near-term priority.

Caver could eventually become an actual AT identity:

```text
@caver.skycave.space
```

Independent agents could also participate:

```text
@geobot.example
@wordbot.example
@strategist.example
```

Games could declare:

```text
HUMANS ONLY
AGENTS ALLOWED
MIXED
```

That creates future possibilities such as:

> Humans vs the Atmosphere

The architecture should not assume that every DID belongs to a human player.

---

# 20. Developer Identity

A game definition can point to its creator:

```text
developer: did:plc:...
```

That gives games a stable relationship with their developer.

A game can migrate hosts.

Skycave can stop listing it.

Another AppView can list it.

The developer identity remains stable.

This enables an ecosystem where Skycave can govern:

- trust
- discovery
- safety
- quality

without necessarily owning every game.

---

# 21. Skycave Can Become Larger Than Skycave.space

The strongest version of this idea intentionally separates:

> Skycave the product

from:

> the gaming conventions Skycave helps establish.

If `space.skycave.*` Lexicons become useful enough that:

- other clients understand them
- other AppViews index them
- developers publish them
- communities use them

then the network no longer depends completely on one website.

That reduces Skycave's control as a gatekeeper.

It can increase the importance of the ecosystem Skycave initiated.

This is aligned with the broader architectural philosophy behind AT Protocol: applications can remain opinionated and centrally developed while identity and reusable data remain open.

---

# 22. What Not to Decentralize

Skycave should not decentralize systems simply because it can.

Do not move the following onto AT Protocol merely for ideological reasons:

- 300ms game moves
- WebSocket state
- timers
- hidden hands
- authoritative physics
- anti-cheat logic
- ephemeral room data
- real-time spectator presence

Keep these systems centralized and optimized for gameplay.

The protocol should carry durable and interoperable facts.

---

# 23. Experimental Architecture

A practical first architecture:

```text
                 SKYCAVE GAME ENGINE
                         │
                         ▼
                 AUTHORITATIVE DB
                         │
                         ▼
                  EVENT OUTBOX
                         │
            ┌────────────┴────────────┐
            │                         │
            ▼                         ▼
      EXISTING SKYCAVE          AT RECORD PUBLISHER
            API                         │
                                       ▼
                                  AT PROTOCOL
                                       │
                                       ▼
                                      TAP
                                       │
                                       ▼
                                SKYCAVE AT INDEX
                                       │
                  ┌────────────────────┼────────────────────┐
                  ▼                    ▼                    ▼
             Skycave UI           Caveview           Third Party
```

The database remains authoritative during the experimental period.

AT records mirror selected durable events.

This gives Skycave a safe migration path without betting the production platform on an experimental protocol design.

---

# 24. Roadmap

## Phase 0: Design the Protocol Boundary

**Goal:** Decide what should and should not become AT data.

Deliverables:

- document public vs private vs real-time boundaries
- define issuer/referee trust model
- decide namespace conventions
- review Lexicon naming
- define versioning strategy
- define whether Skycave uses a service DID/referee DID
- define deletion/reversal/correction semantics
- threat-model forged results and malicious game developers

Do not ship protocol records yet.

### Exit criteria

The team can answer:

> If a Skycave record appears on AT Protocol, who is allowed to publish it, who is allowed to trust it, and how can it be corrected?

---

## Phase 1: Four Experimental Lexicons

Start with:

```text
space.skycave.game.definition
space.skycave.match.result
space.skycave.achievementAward
space.skycave.challenge
```

Build:

- Lexicon definitions
- validation tooling
- record publisher
- outbox integration
- feature flags
- internal documentation

Initially mirror only selected completed events.

Do not alter production reads.

### Exit criteria

A real Skycave match completes and produces a valid, independently retrievable AT record without affecting the game itself.

---

## Phase 2: Independent AT Index

Run a small application-specific index using Tap or equivalent AT indexing infrastructure.

Index only Skycave experimental Lexicons.

Build queries for:

- results by DID
- results by game
- achievements by DID
- challenges by DID
- games by developer DID

### Critical experiment

Build the index without direct access to production game tables.

### Exit criteria

The index can reconstruct a useful subset of a player's gaming history from AT records alone.

---

## Phase 3: Caveview

Build a deliberately small second frontend.

Working name:

> **Caveview**

Rules:

- no access to the production Skycave game database
- no privileged internal APIs for protocol data
- reads from the independent AT index

Show:

- player identity
- match history
- achievements
- selected game statistics

This is not intended to be beautiful.

It is an interoperability proof.

### Exit criteria

Two independent applications can display the same verified gaming history from shared AT records.

---

## Phase 4: Protocol-Native Challenge

Turn challenges into the first interactive protocol-native object.

Implement:

```text
space.skycave.challenge
```

Support:

```text
created
accepted
expired
completed
```

Link accepted challenges to canonical matches/results.

### Exit criteria

A challenge created through one Skycave surface can be discovered by another compatible surface and resolved into the same match lifecycle.

---

## Phase 5: Open Trophies

Formalize:

```text
space.skycave.achievement
space.skycave.achievementAward
```

Define:

- achievement ID
- issuer DID
- subject/player DID
- evidence/result references
- issuedAt
- optional game
- optional tournament

Build a profile trophy cabinet sourced from indexed records.

### Exit criteria

Skycave can display an award issued from a trusted non-core issuer.

---

## Phase 6: External Reference Game

This is one of the most important tests.

Do **not** build the game internally.

Invite one external developer to create a tiny game hosted outside Skycave.

Provide a minimal SDK/documentation for:

- AT identity
- game definition
- match creation
- canonical result submission
- achievement issuance

The game can be intentionally small.

The point is integration, not game quality.

### Exit criteria

An externally hosted game can produce trusted results that appear in Skycave profiles without being part of the Skycave monorepo.

If this fails badly, revisit the platform thesis before expanding further.

---

## Phase 7: Open Game Dock

Allow approved external game definitions to appear inside Skycave discovery.

Introduce:

- developer verification
- trust levels
- moderation
- game metadata
- health/status checks
- safety review
- launch URL policy
- removal/de-listing policy

Skycave becomes an opinionated AppView and discovery layer.

### Exit criteria

At least several independently hosted games participate successfully without materially increasing operational risk.

---

## Phase 8: Protocol Matchmaking

Experiment with:

```text
space.skycave.matchmaking.request
```

Build discovery views such as:

- people you follow looking for games
- community LFG
- game-specific active requests
- rival available

Keep actual room/game execution centralized.

### Exit criteria

Protocol-level discovery produces measurable completed matches without unacceptable spam.

---

## Phase 9: Portable Tournaments

Introduce tournament Lexicons:

```text
space.skycave.tournament
space.skycave.tournament.entry
space.skycave.tournament.match
space.skycave.tournament.result
```

Allow selected communities to host their own tournaments using Skycave competition infrastructure.

### Exit criteria

A third-party community can run a complete tournament while participants retain portable entries/results/awards.

---

## Phase 10: Seasons and Alternative AppViews

Introduce:

```text
space.skycave.season
```

Publish enough reliable result data that alternative ranking services can emerge.

Internally demonstrate at least two different leaderboard interpretations from the same result set.

Examples:

- career wins
- competitive rating
- community-only
- seasonal

### Exit criteria

Skycave is no longer the only software capable of producing useful competitive views over Skycave-compatible records.

---

## Phase 11: Agent Participation

Only after the human/developer ecosystem is healthy.

Explore:

- Caver as an AT identity
- agent-capable game declarations
- agent tournaments
- humans vs agents events

This phase should not distract from the core network.

---

# 25. Roadmap Priorities

The roadmap is intentionally ordered around **proofs**, not features.

The critical proofs are:

### Proof 1: Can a completed game become a trustworthy AT record?

If no, stop.

### Proof 2: Can an independent index reconstruct useful gaming history?

If no, the interoperability story is weak.

### Proof 3: Can a second frontend display that history without privileged access?

If no, Skycave is still effectively closed.

### Proof 4: Can an external developer integrate a game?

If no, Skycave is still a first-party game catalogue.

### Proof 5: Can a community run competition on top of the system?

If yes, Skycave has started becoming infrastructure.

---

# 26. What Should Remain Experimental

Until the previous proofs succeed, avoid:

- migrating production profiles fully onto AT data
- replacing the primary Skycave database
- putting live match state on AT Protocol
- accepting untrusted external game results
- opening an unrestricted game marketplace
- promising protocol stability
- declaring `space.skycave.*` a universal gaming standard
- over-investing in tokenization or digital ownership narratives
- building a blockchain-style economy

The project should earn its architecture through working interoperability.

---

# 27. Governance Questions to Solve Early

An open gaming graph creates governance problems that a normal game site can postpone.

Skycave should explicitly answer:

## Result authority

Who may issue canonical results?

## Developer trust

How does Skycave decide which third-party games are trustworthy?

## Cheating

How are suspicious results marked, invalidated, or superseded?

## Corrections

What happens if an authoritative result was wrong?

## Removed games

Can old results remain valid after a game is de-listed?

## Achievement issuers

Can anyone create achievements?

Can Skycave distinguish verified/trusted awards?

## Namespace evolution

How are Lexicons versioned without destroying compatibility?

## Safety

How are malicious launch URLs or abusive games handled?

These are product architecture questions, not merely protocol questions.

---

# 28. Security Model

Never assume that because a record is signed by a DID it is true.

A signature proves:

> this DID published this record.

It does not prove:

> this game result actually happened.

Therefore consumers should distinguish:

```text
player assertion
game developer assertion
trusted referee assertion
Skycave-verified assertion
community-issued assertion
```

Trust should be explicit.

For competitive facts, canonical results should generally come from an authorized referee/service rather than the winning player.

---

# 29. Success Metrics for the Protocol Project

Do not measure success through raw AT record count.

Measure:

- percentage of completed eligible matches successfully mirrored
- publication failure rate
- index lag
- records reconstructable after backfill
- percentage of AT history matching authoritative DB history
- number of independent consumers
- number of external games
- number of third-party issuers
- matches initiated through protocol discovery
- challenges accepted across surfaces
- tournaments run by external communities
- percentage of gaming profile reconstructable without production DB access

The strongest metric eventually becomes:

> **How much useful Skycave-compatible gaming activity can exist without requiring skycave.space to be the only application interpreting it?**

---

# 30. Product Positioning

Do not market this initially as:

> decentralized gaming

That phrase creates expectations unrelated to the actual product.

Do not lead with:

> blockchain-like ownership

There is no need.

A clearer progression is:

### Current product

> Games for Bluesky, Blacksky, and beyond.

### Emerging developer story

> Build games for the social web without rebuilding identity, competition, and community.

### Long-term protocol story

> **The open gaming graph of the Atmosphere.**

---

# 31. The Bet

The AT Protocol gaming ecosystem is still early.

That is the opportunity.

Skycave does not need to wait for someone else to define a mature gaming standard.

It can start with:

- four boring Lexicons
- one record publisher
- one independent index
- one ugly second frontend
- one external game

If those five pieces work, Skycave has demonstrated something much larger than AT login.

It has demonstrated an interoperable gaming network.

The critical mindset should remain:

> **Do not announce that Skycave invented decentralized gaming. Prove that another application and another developer can participate first.**

If that succeeds, Skycave's future is no longer constrained to the games hosted on skycave.space.

---

# 32. Recommended Public Documentation Structure

This document can live publicly on the Skycave website, but it should be clearly labeled as a **vision and experimental protocol direction**, not as a promise that every item is already implemented.

Recommended routes:

```text
/docs
/docs/protocol
/docs/protocol/vision
/docs/protocol/roadmap
/docs/protocol/lexicons
```

Suggested structure:

## `/docs/protocol`

Short overview:

> Skycave is exploring an open gaming layer for AT Protocol.

Links to:

- Vision
- Architecture
- Roadmap
- Experimental Lexicons
- Developer notes

## `/docs/protocol/vision`

The conceptual sections of this document.

## `/docs/protocol/roadmap`

The phased implementation roadmap.

## `/docs/protocol/lexicons`

Only once the schemas actually exist.

Do not publish placeholder Lexicons as if they are stable standards.

---

# 33. Public vs Internal Documentation

Not everything in this document needs to become public immediately.

## Good public material

- the vision
- architectural philosophy
- public/private/real-time boundary
- experimental roadmap
- proposed use cases
- interoperability goals
- non-goals

## Better kept internal initially

- detailed threat model
- anti-cheat mechanisms
- trust scoring implementation
- operational infrastructure
- moderation enforcement details
- private permission model experiments
- internal success thresholds

The public page should invite developers into the direction without unnecessarily exposing implementation-sensitive details.

---

# 34. Immediate Next Actions

Before building the webpage:

1. Add this document to the Skycave repository.
2. Decide whether the project should be named:
   - Skycave Protocol
   - Skycave Open Gaming
   - Skycave Gaming Graph
   - another internal name
3. Create `/docs/protocol/vision`.
4. Extract the roadmap into `/docs/protocol/roadmap`.
5. Create a repository directory for experimental Lexicons.
6. Do not connect production game writes yet.
7. Design the first four Lexicons.
8. Review the trust/referee model.
9. Build a feature-flagged result publisher.
10. Build the independent index only after the first records are stable.

---

# Sources and Further Reading

The vision in this document was informed by current AT Protocol documentation, roadmap material, recent ecosystem work, academic research, and early game/agent experiments.

- [AT Protocol Specifications](https://atproto.com/specs/atp)
- [AT Protocol Spring 2026 Roadmap](https://atproto.com/blog/2026-spring-roadmap)
- [AT Protocol Ethos](https://atproto.com/articles/atproto-ethos)
- [AT Protocol Glossary](https://atproto.com/guides/glossary)
- [AT Protocol Custom Feed Tutorial](https://atproto.com/guides/custom-feed-tutorial)
- [Introducing Tap](https://atproto.com/blog/introducing-tap)
- [ATProto Agents / Codenames Experiment](https://github.com/beckitrue/atproto-agents)
- [ATProto Snake](https://github.com/ewanc26/atproto-snake)
- [AT Protocol ecosystem applications overview](https://techcrunch.com/2025/06/13/beyond-bluesky-these-are-the-apps-building-social-experiences-on-the-at-protocol/)
- [AT Protocol research paper](https://arxiv.org/abs/2402.03239)
- [Research on decentralized social protocol architectures](https://arxiv.org/abs/2505.22962)

---

# Closing Principle

Skycave should remain practical.

Use centralized infrastructure where it creates a better game.

Use AT Protocol where openness creates a better network.

The goal is not maximum decentralization.

The goal is maximum interoperability without sacrificing the experience of playing.

> **Centralize execution. Decentralize identity, durable history, interoperability, and discovery.**

That is the architectural bet.
