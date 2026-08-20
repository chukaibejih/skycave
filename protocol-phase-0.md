# Phase 0 Design: one Connect 4 result, end to end

**Status: design only. No code, no services, no scaffolding.** This document
specifies the single record path `space.skycave.match.result` (plus its
correction and retraction) and traces one fictional Connect 4 match through the
entire architecture, from game completion to an independent Caveview response.

The bar this document must clear: **an independent developer could implement a
compatible consumer from this document alone**, including correctly rejecting a
forged result and correctly applying a correction.

Everything here is a proposal to be locked before any lexicon JSON is written.
All DIDs and CIDs below are illustrative placeholders.

---

## 0. Scope and non-scope

**In scope (this document):**

- Three record types: `space.skycave.match.result`, `space.skycave.match.resultRevision`, `space.skycave.match.resultRetraction`.
- The identity model (publisher / issuer / referee, and the match key).
- The trust rules a consumer applies.
- The projection state machine (Active / Corrected / Invalid).
- The ingestion pipeline boundary and the normalized domain event.
- The Caveview read contract.

**Explicitly deferred (later proofs, do not design yet):**

- `space.skycave.playReceipt` (writing into a player's own repo). This needs
  OAuth consent, partial adoption, and revocation handling, and proves a
  *different* thing. Proof 1 is "durable facts can live outside the Skycave DB,"
  and referee-issued results alone prove that. Receipts come after.
- `space.skycave.match` start records (a published match object). Phase 0 has no
  match-start record, so match identity is `issuer + matchId`, see section 2.
- Third-party referees, and multi-party issuer / referee / tournament-issuer
  delegation. The schema keeps the roles separate so this stays possible, but
  Phase 0 collapses them onto one DID.
- Seasons, ratings, achievements, alternative leaderboards.
- Self-hosted PDS. The referee account lives on someone else's PDS.

---

## 1. The actors

| Alias | Handle | Illustrative DID | Role in Phase 0 |
|---|---|---|---|
| `REF` | `referee.skycave.space` | `did:plc:ref3ree5kyc4ve000000000a` | Referee, issuer, and publisher of results |
| `DEV` | `skycave.space` | `did:plc:5kyc4ve0brand000000000ab` | Publishes the Connect 4 game definition |
| `ALICE` | `alice.bsky.social` | `did:plc:a1ice000000000000000000ab` | Player, winner |
| `BOB` | `bob.bsky.social` | `did:plc:b0b0000000000000000000ab` | Player, loser |

Three roles are named in the schema even though `REF` performs all three now:

- **Publisher**: the repo a record physically lives in. This is *not* a field.
  It is the DID whose signed commit contains the record. A consumer learns it
  from where the record was fetched, verified by the repo commit signature.
- **Issuer**: the authority asserting the result. A field on the record.
- **Referee**: the service that adjudicated the match. A field on the record.

Phase 0 requires `publisher == issuer == referee == REF`. Section 6 states the
rule. Keeping the three names distinct now is what lets a future third-party Hex
game have `developer = alice`, `referee = REF`, `tournament issuer = blacksky`
without a schema break.

---

## 2. Match identity

A bare internal UUID is meaningful only inside Skycave. On the network, identity
must be namespaced by the authority that minted it. So:

```
matchId   = 0198f2a1-6c3d-7e21-9b4a-2f9c8d1e0abc   (UUIDv7, minted by REF)
matchKey  = issuer + "|" + matchId
          = did:plc:ref3ree5kyc4ve000000000a|0198f2a1-6c3d-7e21-9b4a-2f9c8d1e0abc
```

`matchKey` is the join key everywhere downstream. Two different issuers using the
same UUID would still produce two different matches. The UUID alone is never
treated as global.

**rkey strategy.** The `match.result` record uses `rkey = matchId` (UUIDs are
valid record keys). This makes publication idempotent: a retry is a `putRecord`
upsert to the same path, never a duplicate result. Revisions and retractions are
*separate* records and use time-ordered `tid` rkeys, because there can be more
than one over the life of a match.

```
result      at://REF/space.skycave.match.result/0198f2a1-6c3d-7e21-9b4a-2f9c8d1e0abc
revision    at://REF/space.skycave.match.resultRevision/3l4f2a...      (tid)
retraction  at://REF/space.skycave.match.resultRetraction/3l5x9c...    (tid)
```

---

## 3. The three record shapes

### 3.1 `space.skycave.match.result`

The canonical assertion. Lives in the referee repo.

```json
{
  "$type": "space.skycave.match.result",
  "matchId": "0198f2a1-6c3d-7e21-9b4a-2f9c8d1e0abc",
  "issuer": "did:plc:ref3ree5kyc4ve000000000a",
  "referee": "did:plc:ref3ree5kyc4ve000000000a",
  "game": {
    "uri": "at://did:plc:5kyc4ve0brand000000000ab/space.skycave.game.definition/connect4",
    "cid": "bafyreigdef142c0nnect4rulesengexamplexxxxxxxxxxxxxx"
  },
  "gameVersion": "1.4.2",
  "rulesVersion": "connect4-rules-v1",
  "engineVersion": "skycave-2026.08.19",
  "mode": "versus",
  "outcome": "decisive",
  "players": [
    { "did": "did:plc:a1ice000000000000000000ab", "seat": 1, "result": "win",  "score": 1 },
    { "did": "did:plc:b0b0000000000000000000ab",  "seat": 2, "result": "loss", "score": 0 }
  ],
  "winner": "did:plc:a1ice000000000000000000ab",
  "startedAt": "2026-08-19T18:42:03.000Z",
  "completedAt": "2026-08-19T18:47:51.000Z",
  "createdAt": "2026-08-19T18:47:52.114Z"
}
```

**Why the four version fields (refinement 2).** They answer four different
questions, and a protocol meant to outlive one implementation needs all four:

- `game` strong-ref (uri + cid): *which record was referenced*, pinned to an
  exact content hash so the definition cannot be swapped under the result.
- `gameVersion`: *which release* was played (`1.4.2`).
- `rulesVersion`: *which gameplay semantics* applied (`connect4-rules-v1`). Two
  releases can share rules; a rules change is the one that affects fairness.
- `engineVersion`: *which authoritative implementation* resolved it.

**Note on `completedAt`.** This is issuer-asserted wall-clock time, not
independently verifiable. Consumers should treat it as "the referee says," not
as proof. Ordering that must be authoritative uses commit order (section 8), not
this timestamp.

### 3.2 `space.skycave.match.resultRevision`

A correction. It carries the *full corrected snapshot* (not a delta), so a
consumer never has to merge. It supersedes exactly one result version, pinned by
cid.

```json
{
  "$type": "space.skycave.match.resultRevision",
  "matchId": "0198f2a1-6c3d-7e21-9b4a-2f9c8d1e0abc",
  "issuer": "did:plc:ref3ree5kyc4ve000000000a",
  "supersedes": {
    "uri": "at://did:plc:ref3ree5kyc4ve000000000a/space.skycave.match.result/0198f2a1-6c3d-7e21-9b4a-2f9c8d1e0abc",
    "cid": "bafyreib7res0lt00alicevbob00v1examplexxxxxxxxxxxx"
  },
  "reason": "score-correction",
  "revised": {
    "mode": "versus",
    "outcome": "decisive",
    "players": [
      { "did": "did:plc:a1ice000000000000000000ab", "seat": 1, "result": "win",  "score": 1 },
      { "did": "did:plc:b0b0000000000000000000ab",  "seat": 2, "result": "loss", "score": 0 }
    ],
    "winner": "did:plc:a1ice000000000000000000ab",
    "gameVersion": "1.4.2",
    "rulesVersion": "connect4-rules-v1",
    "engineVersion": "skycave-2026.08.19",
    "startedAt": "2026-08-19T18:42:03.000Z",
    "completedAt": "2026-08-19T18:47:51.000Z"
  },
  "createdAt": "2026-08-19T19:05:10.402Z"
}
```

### 3.3 `space.skycave.match.resultRetraction`

An invalidation. The match has no counting result after this. Never expressed as
a repo delete (a delete can be missed by anyone who already indexed the row; a
retraction is a positive, signed statement that propagates).

```json
{
  "$type": "space.skycave.match.resultRetraction",
  "matchId": "0198f2a1-6c3d-7e21-9b4a-2f9c8d1e0abc",
  "issuer": "did:plc:ref3ree5kyc4ve000000000a",
  "retracts": {
    "uri": "at://did:plc:ref3ree5kyc4ve000000000a/space.skycave.match.result/0198f2a1-6c3d-7e21-9b4a-2f9c8d1e0abc",
    "cid": "bafyreib7res0lt00alicevbob00v1examplexxxxxxxxxxxx"
  },
  "reason": "cheating-detected",
  "note": "Engine replay flagged an impossible move sequence.",
  "createdAt": "2026-08-20T09:12:00.000Z"
}
```

---

## 4. The happy path, step by step

**Fictional match.** Alice beats Bob at Connect 4. Internal UUID
`0198f2a1-6c3d-7e21-9b4a-2f9c8d1e0abc`.

**(1) Production game state, just before completion** (Skycave Postgres, the
game DB, unchanged by any of this):

```
game_sessions row (in progress)
  id            = 0198f2a1-...
  game_type     = connect4
  player1_id    = did:plc:a1ice...   seat 1
  player2_id    = did:plc:b0b0...    seat 2
  turn_state    = { board: [...], turn: did:plc:b0b0... }
  winner_id     = null
```

**(2) Final DB result.** The engine resolves the win. This write is authoritative
and synchronous, exactly as today:

```
game_sessions row (completed)
  winner_id     = did:plc:a1ice...
  player1_score = 1
  player2_score = 0
  completed_at  = 2026-08-19T18:47:51Z
```

**(3) Outbox event.** In the *same transaction* as the result write, a row is
appended to an `at_outbox` table. Game completion never calls the network. If AT
is down, players keep playing and the outbox drains later.

```
at_outbox row
  id            = 7fce...
  match_id      = 0198f2a1-...
  kind          = match.result
  status        = pending
  payload       = { winner, players, versions, timestamps }   (snapshot)
  attempts      = 0
```

**(4) Publisher input.** A worker (living in the existing Node sidecar) picks up
pending outbox rows and builds the record. It is idempotent: `rkey = matchId`, so
a redelivery upserts. The sidecar owns all AT and signing complexity; Python only
ever hands it a plain payload over the existing `x-internal-secret` channel.

```
putRecord
  repo       = did:plc:ref3ree...        (the referee account)
  collection = space.skycave.match.result
  rkey       = 0198f2a1-6c3d-7e21-9b4a-2f9c8d1e0abc
  record     = { the section 3.1 JSON }
```

**(5) The record** is section 3.1 verbatim.

**(6) URI and rkey.**

```
at://did:plc:ref3ree5kyc4ve000000000a/space.skycave.match.result/0198f2a1-6c3d-7e21-9b4a-2f9c8d1e0abc
```

**(7) CID and strong-refs.** Writing the record yields its content id:

```
result cid = bafyreib7res0lt00alicevbob00v1examplexxxxxxxxxxxx
```

The result strong-refs the game definition `{uri, cid}`. Later a revision
strong-refs this result `{uri, cid}`. The cid in every strong-ref pins the exact
version, so nothing referenced can be silently swapped.

**(8) What the referee signs.** This is the crux, and it is *not* a per-record
signature field. In AT Protocol the repository is a signed Merkle structure:

- The record is a node in the referee repo's MST, addressed by its cid.
- The repo commit has a `sig` over the MST root, made with the referee account's
  signing key.
- That key is listed in the referee's DID document (`did:plc:ref3ree...`).

So the provable statement is: *this exact record (this cid) is committed at this
path in the repo controlled by `did:plc:ref3ree...`.* A consumer verifies it by
checking the commit signature against the DID doc's verification method and
checking the MST inclusion proof. No player can manufacture that signature.

**(9) What Tap / the indexer sees.** The indexer's `IngestionSource` (Tap first)
delivers a normalized repo event, with the commit signature already verified:

```
RepoEvent
  repoDid    = did:plc:ref3ree...
  action     = create
  collection = space.skycave.match.result
  rkey       = 0198f2a1-...
  uri        = at://did:plc:ref3ree.../space.skycave.match.result/0198f2a1-...
  cid        = bafyreib7res0lt...
  rev        = 3l4f29ab7c2s     (repo commit revision, authoritative order)
  record     = { the JSON }
  sigVerified = true
```

**(10) Trust decision.** See section 6 for the formal rule. Here:
`publisher = did:plc:ref3ree... == issuer == referee`, and that DID is on the
referee allowlist. **Trusted.**

**(11) Normalized domain event.** Validation + trust produce a `TrustedMatchResult`
(section 7). Projections only ever see this typed value, never raw AT JSON.

**(12) Index database rows** (`skycave_at_index`, a separate DB with its own
credentials that cannot read the game DB):

```
match_result
  match_key          = did:plc:ref3ree...|0198f2a1-...
  match_id           = 0198f2a1-...
  issuer_did         = did:plc:ref3ree...
  referee_did        = did:plc:ref3ree...
  publisher_did      = did:plc:ref3ree...
  game_uri           = at://did:plc:5kyc4ve.../space.skycave.game.definition/connect4
  game_cid           = bafyreigdef142...
  game_version       = 1.4.2
  rules_version      = connect4-rules-v1
  engine_version     = skycave-2026.08.19
  outcome            = decisive
  winner_did         = did:plc:a1ice...
  started_at         = 2026-08-19T18:42:03Z
  completed_at       = 2026-08-19T18:47:51Z
  active_record_uri  = at://.../match.result/0198f2a1-...
  active_record_cid  = bafyreib7res0lt...
  status             = active
  first_seen_at      = 2026-08-19T18:47:53Z
  last_updated_at    = 2026-08-19T18:47:53Z

match_result_player
  (match_key, player_did=alice, seat=1, result=win,  score=1)
  (match_key, player_did=bob,   seat=2, result=loss, score=0)

match_record_log   (append-only event store; projections derive from here)
  (record_uri, match_key, kind=result, cid=bafyreib7..., publisher=REF,
   rev=3l4f29ab7c2s, trusted=true, rejected_reason=null, raw=<json>)
```

**(13) Caveview API response.** `GET /v0/players/did:plc:a1ice.../results`:

```json
{
  "player": "did:plc:a1ice000000000000000000ab",
  "results": [
    {
      "matchKey": "did:plc:ref3ree5kyc4ve000000000a|0198f2a1-6c3d-7e21-9b4a-2f9c8d1e0abc",
      "game": "connect4",
      "gameRef": {
        "uri": "at://did:plc:5kyc4ve0brand000000000ab/space.skycave.game.definition/connect4",
        "cid": "bafyreigdef142c0nnect4rulesengexamplexxxxxxxxxxxxxx"
      },
      "opponent": "did:plc:b0b0000000000000000000ab",
      "result": "win",
      "outcome": "decisive",
      "status": "active",
      "completedAt": "2026-08-19T18:47:51.000Z",
      "issuer": "did:plc:ref3ree5kyc4ve000000000a",
      "record": {
        "uri": "at://did:plc:ref3ree5kyc4ve000000000a/space.skycave.match.result/0198f2a1-6c3d-7e21-9b4a-2f9c8d1e0abc",
        "cid": "bafyreib7res0lt00alicevbob00v1examplexxxxxxxxxxxx"
      },
      "verifiable": true
    }
  ]
}
```

Caveview reads only this API. It has no path to the game DB. That is the Proof 3
constraint made physical.

---

## 5. Corrections and retractions on the same path

Both travel the identical pipeline: outbox, publisher, referee repo, Tap,
validation, trust, domain event, projection. Only the record type differs, and
only the projection reacts differently.

### 5.1 Correction (a revision)

The referee re-adjudicates and the score was wrong. It publishes a
`resultRevision` (section 3.2) whose `supersedes` pins the original result's
`{uri, cid}`. The indexer:

```
match_record_log  += (kind=revision, cid=bafyreic0rrev..., supersedes=v1 cid, rev=3l5m..)
```

Projection recomputes `match_key`:

```
match_result
  active_record_uri = at://.../match.resultRevision/3l4f2a...
  active_record_cid = bafyreic0rrev...
  status            = corrected
  last_updated_at   = 2026-08-19T19:05:11Z
  (player rows / winner / versions rewritten from revision.revised)
```

Caveview now returns `"status": "corrected"` and the corrected fields. The
original result stays in the log (auditable), marked superseded.

### 5.2 Retraction

The referee's replay flags cheating. It publishes a `resultRetraction`
(section 3.3). Projection:

```
match_result
  status          = invalid
  last_updated_at = 2026-08-20T09:12:01Z
```

Caveview drops the match from `results` (or shows it as `invalid`, a consumer
choice). It no longer counts anywhere.

### 5.3 The state machine

```
                 (no revision, no retraction)
   RESULT ──────────────────────────────────────►  ACTIVE
     │
     ├── resultRevision (latest wins) ───────────►  CORRECTED
     │
     └── resultRetraction ───────────────────────►  INVALID   (terminal)
```

Precedence: **retraction > revision > original.** If both a revision and a
retraction exist for a match, the match is INVALID. Among multiple revisions, the
latest by commit `rev` wins. A retraction is terminal for Phase 0 (no "un-retract";
a genuinely new match gets a new `matchId`).

---

## 6. Trust rules (the part an external consumer must implement)

A record `R` in collection `space.skycave.match.*` is **trusted** if and only if:

1. **Well-formed.** `R` validates against its lexicon.
2. **Authentic.** The publishing repo `D_pub` is established from a verified
   commit signature over the MST containing `R` (the `IngestionSource`
   guarantees `sigVerified = true`, or the consumer verifies it itself).
3. **Authorized issuer.** `D_pub` is in the referee allowlist. Phase 0 allowlist
   is exactly `{ did:plc:ref3ree5kyc4ve000000000a }`.
4. **No cross-claims.** `R.issuer == D_pub`. A referee may only issue as itself.
5. **Own-target for revision/retraction.** For `resultRevision` /
   `resultRetraction`, the repo of `supersedes.uri` / `retracts.uri` equals
   `D_pub`, and its `cid` matches a result version already in the log. A referee
   may only revise or retract its own results, and only a version it can name by
   content hash.

Any failure means **untrusted**: the record is written to `match_record_log` with
`trusted=false` and a `rejected_reason`, and it never becomes a domain event or
touches a projection.

The allowlist is the single extension point. Phase 6+ turns rule 3 into "issuer is
trusted *for this game definition*," read from the game definition's declared
referees. Nothing else in this section changes.

---

## 7. The pipeline boundary

The indexer is not "Tap then write leaderboard tables." There is a normalized
event layer between the network and the projections, so schema versions, multiple
issuers, corrections, and malformed records are all resolved *before* any
projection logic runs. A projection must never have to ask "did this repo have
authority to say Alice beat Bob." That was decided upstream.

```
IngestionSource            (Tap first; Jetstream v2 or fixtures later)
      │  RepoEvent (sig-verified)
      ▼
Lexicon Validation         (shape only)
      │  ValidRecord
      ▼
Trust Evaluation           (section 6 rules; allowlist)
      │  TrustedMatchResult  |  RejectedRecord
      ▼
Normalized Domain Event
      │
      ▼
Projections                (match_result, match_result_player, Caveview reads)
```

The ingestion seam (adopted from the review):

```ts
interface IngestionSource {
  backfill(opts: BackfillOptions): AsyncIterable<RepoEvent>
  subscribe(cursor?: string): AsyncIterable<RepoEvent>
}
// implementations: TapIngestionSource (first), JetstreamIngestionSource, FixtureIngestionSource
```

The normalized domain event the projections consume:

```ts
type StrongRef = { uri: string; cid: string }

type TrustedMatchResult = {
  kind: "result" | "revision" | "retraction"
  matchKey: string          // issuer|matchId
  matchId: string
  issuerDid: string
  refereeDid: string
  publisherDid: string      // == issuerDid in Phase 0, still recorded
  recordUri: string
  recordCid: string
  observedRev: string       // repo commit rev: authoritative ordering
  gameRef?: StrongRef        // present on result and revision
  gameVersion?: string
  rulesVersion?: string
  engineVersion?: string
  players?: { did: string; seat: number; result: "win" | "loss" | "draw"; score: number }[]
  winnerDid?: string
  outcome?: "decisive" | "draw" | "abandoned"
  startedAt?: string
  completedAt?: string
  supersedes?: StrongRef     // revision only
  retracts?: StrongRef       // retraction only
  reason?: string
}
```

Ordering is by `observedRev` (repo commit revision from Tap), never by the
issuer-asserted `completedAt` or `createdAt`.

---

## 8. The forged result, rejected

Alice tries to fake a win. She writes, into **her own** repo:

```json
{
  "$type": "space.skycave.match.result",
  "matchId": "ffffffff-dead-beef-0000-000000000001",
  "issuer": "did:plc:ref3ree5kyc4ve000000000a",
  "referee": "did:plc:ref3ree5kyc4ve000000000a",
  "game": { "uri": "at://did:plc:5kyc4ve.../space.skycave.game.definition/connect4", "cid": "bafyreigdef142..." },
  "winner": "did:plc:a1ice000000000000000000ab",
  "players": [
    { "did": "did:plc:a1ice...", "seat": 1, "result": "win",  "score": 999999 },
    { "did": "did:plc:b0b0...",  "seat": 2, "result": "loss", "score": 0 }
  ],
  "completedAt": "2026-08-19T20:00:00.000Z",
  "createdAt": "2026-08-19T20:00:00.000Z"
}
```

Published at `at://did:plc:a1ice.../space.skycave.match.result/...`. It is a real,
signed, network-visible record, so Tap delivers it. Then:

- **Validation:** passes. It is well-formed.
- **Trust, rule 2:** `D_pub = did:plc:a1ice...` (the commit is signed by Alice's
  key, and it can only be, she cannot sign as the referee).
- **Trust, rule 3:** `did:plc:a1ice...` is not on the referee allowlist. **Reject.**
- **Trust, rule 4** would also fail: `issuer (REF) != D_pub (alice)`.

Result: logged as `trusted=false, rejected_reason="publisher-not-referee"`, no
domain event, no projection, never in any Caveview response. Alice cannot publish
into the referee's repo (no key), and a result in her own repo carries no
authority. Authority comes from *where the signed record lives*, not from what it
claims. That is the whole ownership-vs-authority mechanism reduced to rules 2 to 4.

---

## 9. What a compatible consumer must implement

From this document alone, an independent developer needs:

1. Resolve DIDs to DID documents; obtain the referee's signing key.
2. Consume repo events (any `IngestionSource`) and verify commit signatures, or
   trust an ingestion layer that does.
3. Hold the referee allowlist (Phase 0: one DID).
4. Validate against the three lexicons.
5. Compute `matchKey = issuer + "|" + matchId`.
6. Apply the section 6 trust rules.
7. Apply the section 5.3 state machine, ordered by commit `rev`.
8. Handle a raw repo `delete` of a trusted result defensively: treat as an
   implicit retraction (status INVALID), while documenting that the canonical
   path is a `resultRetraction` record, not a delete.

If two independent implementations agree on Active / Corrected / Invalid and on
the winner for every match, and both reject the forgery, the semantics are
unambiguous and Phase 0 is locked.

---

## 10. Open questions to settle before writing lexicon JSON

1. **Draw and non-versus shape.** Connect 4 is win/loss. The `players[].result`
   plus `outcome` model needs a decision for draws, solo scores, and (later) team
   games before the lexicon is fixed.
2. **`reason` enums.** Fixed enum plus free-text `note`, for both revision and
   retraction. Enumerate the first set.
3. **Revision carries full snapshot vs delta.** This document chose full snapshot
   (`revised` is a complete result body). Confirm.
4. **Ordering source.** This document chose repo commit `rev`. Confirm `rev` is
   exposed by the chosen `IngestionSource` and is monotonic per repo.
5. **`matchId` in the public URI.** `rkey = matchId` puts the UUID in the AT-URI.
   Acceptable (a UUIDv7 leaks only a timestamp). Confirm no objection.
6. **Game definition availability.** The result strong-refs a definition record.
   Decide whether the index must resolve and cache the definition, or may store
   the strong-ref unresolved in Phase 0 (proposed: store unresolved, resolve
   lazily).
7. **Clock trust.** `completedAt` is issuer-asserted. Confirm nothing downstream
   treats it as verifiable.

Once these are answered, the three lexicon JSON files can be written with no
further semantic ambiguity.
