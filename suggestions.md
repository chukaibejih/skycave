# Updates/Modifications to Be Put Into Consideration

1. **Make retention the primary product metric**

   * Track Weekly Returning Players alongside total games played.
   * Add D1, D7, D14 and D30 retention.
   * Track first game → second game → fifth game → tenth game.
   * Measure retention by acquisition source and first game played.
   * Avoid allowing heavy users to make overall engagement look healthier than it actually is.

2. **Instrument the full 1v1 invite funnel**

   * Track:
     `Room created → Link shared → Link opened → Opponent joined → Game started → Game completed`
   * Investigate the current ~25% expired/no-show rate.
   * Determine exactly where and why potential opponents disappear.

3. **Track rematch rate**

   * Measure how often completed 1v1 games produce another game between the same players.
   * Break it down by game.
   * Treat this as one of the strongest indicators that a game works socially.

4. **Make rivalries actionable**

   * Add **Challenge** directly beside players in the Rivalries section.
   * Allow one-tap challenges from another player's profile.
   * Don't make users return to the game catalogue to challenge someone they already know.

5. **Bring rivalry context into post-game**

   * After a game, show something like:
     `RIVALRY: JAE LEADS 15-12`
   * Update it immediately after each result.
   * Make **Rematch** feel like continuing an existing contest rather than starting another isolated game.

6. **Expand rivalry history gradually**

   * Clicking a rivalry could eventually show:

     * Head-to-head record
     * Games played
     * Recent meetings
     * Current winning streak
     * Biggest streak
     * Most-played game together
   * Keep this lightweight initially. Don't build a giant statistics system yet.

7. **Improve the existing post-game loop**

   * You already have Rematch, New Game, Post to Bluesky and downloadable score cards.
   * Instrument which actions people actually take.
   * Test whether the hierarchy/order of these actions affects another game being created.

8. **Turn solo scores into challenges**

   * Instead of only sharing:
     `I SCORED 154`
   * Allow:
     `I SCORED 154 IN UNO. CAN YOU BEAT IT?`
   * The shared link should take someone directly into that game.
   * Their score can then be compared against the challenger.

9. **Make shared results interactive acquisition surfaces**

   * A result shared to Bluesky/Blacksky shouldn't be a dead announcement.
   * Wherever practical, give viewers an obvious route to:
     **Challenge player / Beat this score / Play this game.**

10. **Measure social acquisition**

    * Track:
      `Shared link → Visitor → Game → Account connected → Returning player`
    * Determine how many existing players actually create new players.

11. **Keep guest play frictionless**

    * Don't require authentication before someone can accept a challenge.
    * Let them experience the game first.
    * Present AT Protocol login afterward with concrete benefits:
      **save stats, rankings, achievements, rivalries and tournament participation.**

12. **Measure guest-to-member conversion**

    * You currently have substantial guest activity.
    * Determine how many guests:

      * Play once
      * Play multiple games
      * Connect an AT identity
      * Return later
    * Experiment with the best moment to offer account connection.

13. **Treat the weekly tournament as programming, not a feature**

    * Establish a predictable cadence.
    * Registration announcement.
    * Registration reminder.
    * Bracket reveal.
    * Tournament start.
    * Live-match coverage.
    * Final.
    * Champion announcement.
    * Eventually, people should know when "Skycave weekend" happens without checking.

14. **Measure tournament retention**

    * Track:
      `Registered → Showed up → Played → Returned next tournament`
    * Also measure how many non-tournament players become tournament players.

15. **Integrate spectating deeply into tournaments**

    * Surface **LIVE NOW** prominently.
    * After someone is eliminated, direct them toward matches they can watch.
    * Show spectator counts where useful.
    * Keep reactions lightweight and social.

16. **Measure spectator-to-player conversion**

    * Ask whether people who watch games later:

      * Play a game
      * Challenge someone
      * Register for a tournament
      * Return to Skycave
    * This determines whether spectating is entertainment only or also a growth mechanism.

17. **Connect tournament achievements to profiles**

    * Show tournament wins.
    * Finals reached.
    * Possibly tournament appearances.
    * Don't overload profiles with statistics until enough tournament history exists.

18. **Turn achievements into events**

    * Don't let achievements exist only as badges someone discovers on their profile.
    * When earned, show:
      `ACHIEVEMENT UNLOCKED: NEMESIS`
    * Allow it to be shared.

19. **Add achievements for social behaviour**

    * Examples:

      * Play five different opponents
      * Complete your first rematch
      * Beat a rival
      * Enter a tournament
      * Win a tournament match
      * Reach a final
      * Watch a tournament final
    * Reward participation in Skycave's social loops, not just grinding.

20. **Clarify what "Overall Rank" represents**

    * The current system prioritizes 1v1 wins and then total score.
    * That rewards activity/accomplishment, but doesn't necessarily identify the strongest player.
    * Make sure the UI doesn't imply something the algorithm doesn't measure.

21. **Consider separating career ranking from competitive skill**

    * Keep the existing system as something like an overall/career ranking if appropriate.
    * Later introduce a competitive rating using Elo, Glicko or another suitable model if competitive 1v1 becomes important.
    * Don't implement this merely because competitive ratings sound sophisticated.

22. **Keep per-game leaderboards**

    * These are valuable because players can develop identities around individual games.
    * Someone can become "the Mancala player" or "the Uno person."
    * That creates more interesting reputations than one universal leaderboard.

23. **Improve game-level analytics**

    * For every game measure:

      * Unique players
      * Total plays
      * Plays/player
      * Completion rate
      * Repeat rate
      * Rematch rate
      * 1v1 vs solo usage
      * Guest/member split
      * Retention after playing
    * Don't judge game quality purely by total plays.

24. **Pause aggressive expansion of the game catalogue**

    * Fourteen games is enough to learn from right now.
    * New games can still launch occasionally.
    * But engineering effort should favor strengthening social loops over racing toward 20, 30 or 50 games.

25. **Identify Skycave's "gateway games"**

    * Determine which games are best at converting a first-time visitor into a returning player.
    * The most-played game isn't necessarily the best gateway.
    * Optimize discovery around games with strong downstream retention.

26. **Interview power users**

    * Talk to people with unusually high play counts.
    * Find out:

      * Why they return
      * Who they play with
      * Which features matter
      * How they discover opponents
      * What makes them rematch

27. **Interview people who disappeared**

    * Potentially more valuable than interviewing fans.
    * Find users who played once or twice and stopped.
    * Ask what happened rather than asking whether they "liked Skycave."

28. **Build around existing AT identities rather than recreating a social network**

    * Don't build friends, followers, DMs or another social graph unless a strong product need emerges.
    * Bluesky/AT Protocol already supplies identity and social relationships.
    * Skycave should supply the **gaming relationships**.

29. **Treat "Rival" as a Skycave-native relationship**

    * This is potentially more valuable than adding friends.
    * The social network tells me who I follow.
    * Skycave can tell me **who I need to beat.**

30. **Explore AT Protocol-native records carefully**

    * Research whether concepts such as:
      `game.result`
      `game.challenge`
      `tournament.entry`
      `achievement`
      could eventually make sense as Lexicon records.
    * Research now, but don't decentralize everything simply because the protocol allows it.

31. **Treat Bluesky as distribution, not Skycave's boundary**

    * Skycave should work naturally with Bluesky while remaining conceptually an AT Protocol gaming platform.
    * This leaves room for Blacksky and other current/future AT clients and communities.

32. **Deepen the Blacksky relationship**

    * Don't treat Blacksky only as somewhere to advertise.
    * Build recurring community traditions around tournaments and games.
    * Champions, rivalries, upsets and recurring competitors can become part of community culture.

33. **Experiment with community tournaments later**

    * If the existing tournament proves sticky, eventually allow communities to host branded events.
    * Skycave could handle:
      `Registration → Bracket → Games → Spectating → Results → Champion`
    * This could eventually turn Skycave into gaming infrastructure for AT communities.

34. **Make profiles more useful rather than substantially larger**

    * Profiles already contain enough information.
    * Focus on actions from them:

      * Challenge
      * View rivalry
      * Share profile
      * View tournament accomplishments
    * Don't turn profiles into giant statistical dashboards.

35. **Connect currently separate systems**

    * This should be one of the largest priorities.
    * Aim for loops such as:

      `PROFILE → RIVAL → CHALLENGE → MATCH → RESULT → REMATCH`

      `TOURNAMENT → MATCH → SPECTATE → RESULT → PROFILE → NEXT TOURNAMENT`

      `SOLO SCORE → SHARE → FRIEND PLAYS → ACCOUNT CONNECT → CHALLENGE`

36. **Track unique opponents per player**

    * Distinguish between someone playing 100 games against one person and someone playing 100 games against 30 people.
    * Both behaviours are valuable, but they indicate very different product dynamics.

37. **Track repeat-opponent rate**

    * Determine what percentage of 1v1 players ever play the same opponent again.
    * This is particularly important for validating the rivalry thesis.

38. **Track player concentration**

    * Monitor what percentage of total games comes from the top 1, 5 and 10 players.
    * Heavy users are great, but they shouldn't disguise weak broader retention.

39. **Don't overbuild monetization yet**

    * First establish recurring behaviour.
    * Avoid introducing currencies, complicated subscriptions, marketplaces or pay-to-compete systems before understanding what users value enough to return for.

40. **Avoid building unnecessary platform features**

    * No Skycave chat system yet.
    * No friends system.
    * No guild/clan infrastructure yet.
    * No native mobile app yet.
    * No complicated XP economy.
    * No major architectural rewrite without evidence that it's needed.

41. **Use the next 60 days to test three core hypotheses**

    * **Rivalries:** Do repeat opponents create retention?
    * **Tournament culture:** Does a recurring tournament create a weekly habit?
    * **Social distribution:** Can existing players reliably cause other people to play?

42. **Review the product based on cohorts, not milestone numbers**

    * Celebrate 5,000 and 10,000 games publicly because they're good community milestones.
    * Internally, care much more about:
      **weekly retention, rematches, repeat opponents, invite conversion, guest conversion and tournament return rate.**

43. **Define the bigger thesis, but don't prematurely build it**

    * A useful internal direction is:

      **"Skycave is the multiplayer social gaming layer of the Atmosphere."**

    * The immediate mission is much smaller:

      **Prove that playing with someone on Skycave creates a reason to come back and play again.**

If I were prioritizing the backlog tomorrow, **#1-16 and #35-38 are where I'd spend most of the next 6 to 8 weeks**. A lot of everything after that is strategic optionality. You already have an unusually broad feature set for a product this young. The highest-value work now is learning which parts actually cause the next session.



Yes. This is useful because it confirms that **the social distribution loop already exists too**, and it's better than I assumed.

You already have three different share behaviours visible here:

* **Solo:** `23 correct · 60 seconds · personal best → beat my score`
* **1v1:** match result → opponent mention → `your turn`
* **Link preview:** Skycave gets a recognizable branded card underneath the post.

So I would remove "build shareable challenges/results" from my earlier roadmap. **You've built it. The job now is optimizing it.**

The biggest thing I notice is actually the preview card. Every shared result currently produces essentially the same generic **"Skycave, Games for Bluesky..."** card.

That's leaving value on the table.

Ideally, when someone shares:

> COLOR CLASH
> 23 CORRECT · 60 SECONDS
> PERSONAL BEST
>
> BEAT MY SCORE

the embed itself should visually reinforce **that specific challenge**, rather than advertising Skycave generically.

Likewise for 1v1:

> **COLOR CLASH**
> ROSE MICHELLE 5
> CONFLICTEDAIRR 4
>
> **CAN YOU BEAT THE WINNER?**

That makes the feed object itself interesting even before somebody reads the post copy.

So I'd add one concrete item near the top of our modification list:

### 44. Make shared links generate contextual social cards

Instead of one generic Skycave Open Graph image for every URL, generate dynamic OG metadata based on the destination.

For `/results/...`, show the game, players and result.

For a solo challenge, show the score and **BEAT THIS SCORE**.

For tournament links, show tournament status/bracket information.

For live tournament matches, potentially show **LIVE NOW** and the competitors.

For profiles, show the player, rank and headline stats.

The underlying principle is:

**The post provides the personality.
The embed provides the context.
The link provides the action.**

And I wouldn't over-design these cards. Your existing dark Skycave visual identity is good. Make them instantly recognizable in a feed, but let **the result/challenge be the largest information**, not the Skycave logo.

There's another important thing your screenshot confirms: people are **already writing their own language around Skycave**.

> "I got absolutely smoked"

> "Good games @..."

> "beat my score"

That is exactly what you want. **Don't automate the humanity out of this.**

Give people a sensible prefilled post, but let them edit it. Eventually you may even want the default text to become *less* verbose as the embed becomes more informative.

This screenshot actually makes me more confident about one part of the thesis from earlier: Skycave doesn't need to manufacture a social network. **The conversation is already happening on Bluesky/Blacksky. Skycave needs to keep supplying things worth talking about.**
