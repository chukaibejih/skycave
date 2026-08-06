"use client";
import { TournamentShell } from "@/components/tournament/TournamentShell";
import { TOURNEY } from "@/lib/tournamentStatus";

/**
 * The rulebook. Static, and deliberately so: these rules do not change week to
 * week, and a player deciding whether to enter wants the whole shape in one
 * read. It also answers, in advance, the questions the announcement posts and
 * the fixtures will raise ("why did a drawn game replay", "what is a bye").
 */
export default function RulebookPage() {
  return (
    <TournamentShell active="rules">
      <h1 className="font-[var(--font-display)] text-2xl font-bold">Rulebook</h1>
      <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
        One weekend, straight knockout. Here is the whole shape of it.
      </p>

      <div className="mt-7 space-y-6">
        <Rule n="1" title="Entry">
          Open to anyone with a Bluesky account. Sign up during the week; entries
          close on the deadline or when the field is full, whichever lands first.
          Guests cannot enter, because every fixture tags real handles.
        </Rule>

        <Rule n="2" title="The draw">
          Random pairing, single elimination. Lose your series and you are out.
          The whole bracket, every fixture and its games, goes up the moment
          entries close, so you know what you face and can practise.
        </Rule>

        <Rule n="3" title="Best of three">
          Each fixture is best of three. The three games are drawn up front from
          the pool, and they are the same three for both players. First to two
          wins goes through; at two nil the third game is not played.
        </Rule>

        <Rule n="4" title="A drawn game">
          If a game ends level it is replayed, as the same game, up to twice.
          After that the series falls to total points, so a fixture can never
          stall the bracket.
        </Rule>

        <Rule n="5" title="Hosting">
          The host arrives with a slightly warmer connection, so hosting swaps
          from game to game across a series. Over three games it evens out, and
          nobody holds the host seat the whole way.
        </Rule>

        <Rule n="6" title="Check in, do not race">
          Players are spread across every timezone, so there is no kickoff time
          to miss. Check in any time in the round window; the room opens by
          itself once both of you have. Never check in, and past the deadline the
          fixture goes to whoever did. That punishes ghosting without punishing
          being asleep at the wrong hour.
        </Rule>

        <Rule n="7" title="Byes">
          When the field is not a power of two, some first-round players get a
          bye straight into round two. Byes are dealt by the draw, not earned:
          luck, not a reward, and spread across the bracket rather than clustered.
        </Rule>

        <Rule n="8" title="The deadlines">
          Every round has a window, computed back from the closing wall so the
          whole tournament fits inside its weekend. Finish a round early and the
          next one simply gets longer; a deadline never moves earlier than
          published.
        </Rule>

        <Rule n="9" title="Keep it good-natured">
          Play hard, stay kind: everyone in the draw is a real person, and this
          is a small room. To reach an opponent, use the nudge, which posts a
          friendly poke to them from your own account. Keep the back and forth
          on the timeline rather than in DMs, so it stays public, easy to follow,
          and good-humoured for everyone watching.
        </Rule>
      </div>

      <p className="mt-8 text-xs leading-5 text-[var(--color-text-secondary)]">
        Knocked out early? Your weekend is not over: the leaderboard runs all
        weekend, and there is another tournament next week.
      </p>
    </TournamentShell>
  );
}

function Rule({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3.5">
      <div
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full border font-[var(--font-display)] text-sm font-bold"
        style={{
          borderColor: `color-mix(in srgb, ${TOURNEY.accent} 45%, transparent)`,
          color: TOURNEY.accent,
        }}
      >
        {n}
      </div>
      <div className="min-w-0">
        <h2
          className="font-[var(--font-display)] text-base font-bold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {title}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">
          {children}
        </p>
      </div>
    </div>
  );
}
