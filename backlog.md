# Skycave — build backlog

Triaged from `suggestions.md` (raw strategic input, written without codebase
access). This is the build-only shortlist. Measurement/analytics and strategic
framing were deliberately discarded — see the bottom.

Order below is the recommended sequence: make shares pull people in, then
tighten the rivalry loop, then reward it.

## To build

1. **Contextual social cards** (was #44)
   Every share currently renders the generic Skycave OG card. Make the embed
   show the actual thing: `/results/*` → game + players + score; a solo score →
   the score + "beat this"; a live tournament match → LIVE + competitors; a
   profile → player + rank. Reuse the existing OG infra (`opengraph-image`
   routes, tournament OG, Satori/Remotion). The post gives the personality, the
   embed gives the context, the link gives the action. Keep the result the
   largest thing, not the logo. Biggest lever.

2. **Rivalry in post-game** (was #5)
   After a 1v1 result, surface the head-to-head ("JAE LEADS 15-12") from the
   rivalry data that already exists, and frame Rematch as continuing a contest
   rather than starting a fresh isolated game.

3. **One-tap Challenge from profile + rivalry** (was #4 / #34)
   The challenge flow already exists (`ChallengeFlow.tsx`); wire a Challenge
   action directly into `/u/[handle]` and the rivalry surface, so nobody detours
   back through the game catalogue.

4. **Solo score → real challenge** (was #8)
   Extend the solo share so the link drops the opponent straight into that game
   and compares their score against the challenger, instead of a dead "I scored
   154".

5. **Achievement moments** (was #18 / #19)
   No achievement system exists today. Add a lightweight one tied to social acts,
   not grinding: first rematch, beat a rival, enter a tournament, win a
   tournament match, reach a final. Show "ACHIEVEMENT UNLOCKED: ..." when earned
   and let it be shared. Do after 1-4.

6. **Honest rank label** (was #20, sub-point)
   One-line copy fix: "Overall Rank" measures activity (1v1 wins then total
   score), not who is strongest. Make the UI not imply otherwise.

## Discarded (do not build)
- **All measurement / analytics**: #1, 2, 3, 10, 12, 14, 16, 23, 36, 37, 38, 42.
  No product-analytics layer, and we chose not to build one now.
- **Premature / strategic / not a dev task**: #21 Elo/Glicko, #30 AT Lexicon
  records, #33 community-hosted tournaments, #39/#40 guardrails, #26/#27 user
  interviews, #41/#42/#43 thesis framing, #17/#25/#31/#32 park.

## Already shipped (moot)
Share basics (#8/#9), post-game loop (#7), guest play (#11), tournament cadence
and posting (#13), spectating + LIVE (#15), ranks & per-game leaderboards
(#20/#22), rivalry data (#24/#29), challenge flow + friends (#4 infra).
