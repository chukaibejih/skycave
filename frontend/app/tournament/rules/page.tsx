"use client";
import { Fragment } from "react";
import { TournamentShell } from "@/components/tournament/TournamentShell";
import { TOURNEY } from "@/lib/tournamentStatus";

/**
 * The rulebook. Static, and deliberately so: these rules do not change week to
 * week, and a player deciding whether to enter wants the whole shape in one
 * read. It also answers, in advance, the questions the announcement posts and
 * the fixtures will raise ("when does my round open", "why did a drawn game
 * replay", "how is it decided if my opponent never shows").
 */

// The full-field (up to 64) timetable. Every window is anchored to Eastern, the
// latest zone, so the nightly wall lands at 10 PM ET for everyone; the same
// instant shows in each player's own zone on the bracket. Pacific is the
// northstar for openings (nothing opens before 8 AM PT).
const SCHEDULE = [
  { r: "R1", name: "Round of 64", day: "Thursday", et: "5-10 PM ET", pt: "2-7 PM PT" },
  { r: "R2", name: "Round of 32", day: "Friday", et: "5-10 PM ET", pt: "2-7 PM PT" },
  { r: "R3", name: "Round of 16", day: "Saturday", et: "11 AM-4 PM ET", pt: "8 AM-1 PM PT" },
  { r: "R4", name: "Quarterfinals", day: "Saturday", et: "5-10 PM ET", pt: "2-7 PM PT", gap: true },
  { r: "R5", name: "Semifinals", day: "Sunday", et: "11 AM-4 PM ET", pt: "8 AM-1 PM PT" },
  { r: "Final", name: "Final", day: "Sunday", et: "5-10 PM ET", pt: "2-7 PM PT", last: true, gap: true },
];

export default function RulebookPage() {
  return (
    <TournamentShell active="rules">
      <h1 className="font-[var(--font-display)] text-2xl font-bold">Rulebook</h1>
      <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
        Thursday to Sunday, straight knockout. Here is the whole shape of it.
      </p>

      <div className="mt-7 space-y-6">
        <Rule n="1" title="Entry">
          Open to anyone with a Bluesky account. Sign up during the week; entries
          close at <strong>noon Pacific on Thursday</strong> (3 PM Eastern), or
          when the field is full, whichever lands first. Guests cannot enter,
          because every fixture tags real handles.
        </Rule>

        <Rule n="2" title="The draw">
          Random pairing, single elimination. Lose your series and you are out.
          The whole bracket, every fixture and its three games, goes up the moment
          entries close, so you know what you face and can practise.
        </Rule>

        <Rule n="3" title="The schedule">
          The tournament runs across four evenings, Thursday to Sunday. Each round
          has its own window with a fixed open and a fixed deadline. Two anchors
          never change: nothing opens before <strong>8 AM Pacific</strong>, and
          each night&apos;s decisive round closes at <strong>10 PM Eastern</strong>,
          the latest timezone, so no one is ever asked to play past their night.
          On the two days that carry two rounds, there is a one-hour break between
          them; when a round is the last of its night, the break is simply the
          rest of the evening and the whole next morning. The final is always
          Sunday night.
        </Rule>

        <Timetable />

        <Rule n="4" title="Windows open on time, not early">
          A round opens at its published time even if the round before it finished
          early. Win with hours to spare and you rest until the next window opens;
          a countdown shows exactly when. This is deliberate: it means a match can
          never go live while you are asleep, and both players meet on a level,
          scheduled footing. Every round that ends is posted with the next
          window&apos;s countdown, and each new day&apos;s play is announced an
          hour before it opens, so you are never caught out.
        </Rule>

        <Rule n="5" title="Show up, not just check in">
          Checking in only confirms that you intend to play. It does not
          guarantee that you will advance. If your opponent does not show up, or
          does not get ready to play within the time, you receive the win, even
          if they were the one due to make the first move. What matters is being
          present and ready to play, not whether you managed to make a move.
        </Rule>

        <Rule n="6" title="Best of three">
          Each fixture is best of three. The three games are drawn up front from
          the pool, and they are the same three for both players. First to two
          wins goes through; at two nil the third game is not played.
        </Rule>

        <Rule n="7" title="A drawn game">
          If a game ends level it is replayed, as the same game, up to twice.
          After that the draw stands and the series moves on, falling to total
          points if it has to, so a fixture can never stall the bracket.
        </Rule>

        <Rule n="8" title="Hosting">
          The host arrives with a slightly warmer connection, so hosting swaps
          from game to game across a series. Over three games it evens out, and
          nobody holds the host seat the whole way.
        </Rule>

        <Rule n="9" title="Stay active, or you forfeit">
          Once a game has started, you are expected to stay active and take your
          turns within the time allowed. If it is your turn and you do not make a
          move before the timer runs out, you may forfeit that game. If you
          disconnect, you have a short window to return before it is forfeited.
          This keeps a whole match from being held up because one player has
          stopped playing.
        </Rule>

        <Rule n="10" title="How a fixture is decided">
          <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">
            Most fixtures end on the board: first to two game wins takes it. When
            they do not, here is how the seat is settled.
          </p>
          <p className="mt-3 text-sm font-semibold text-[var(--color-text-primary)]">
            If the series runs out of games
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">
            When every game is drawn and replayed to its cap, nobody reaches two
            wins. The series then goes to whoever won more games, and if that is
            level, to whoever scored more points across the three.
          </p>
          <p className="mt-3 text-sm font-semibold text-[var(--color-text-primary)]">
            If the deadline arrives with the fixture still open
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">
            The seat is awarded by the first of these that separates the two
            players:
          </p>
          <ol className="mt-2 space-y-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
            <Step n={1}>Whoever won more games.</Step>
            <Step n={2}>Whoever showed up and got ready to play when the other did not.</Step>
            <Step n={3}>If both played, whoever scored more total points.</Step>
          </ol>
          <p className="mt-3 text-sm font-semibold text-[var(--color-text-primary)]">
            Check-in order never decides a match
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">
            Being the first to check in gives you no advantage. Fixtures are
            settled by games played and legitimate forfeits, never by who clicked
            &ldquo;check in&rdquo; first.
          </p>
          <p className="mt-3 text-sm font-semibold text-[var(--color-text-primary)]">
            If neither player shows up to play
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">
            The match is a no-contest. Neither player advances, and the
            next-round opponent receives a walkover. If it happens in the final,
            no champion is crowned.
          </p>
        </Rule>

        <Rule n="11" title="The play-in">
          When the field is not a clean bracket size, the last players to register
          play a play-in: a quick qualifier for the final main-draw seats, held
          before Round 1. Win it and you are in; lose it and that is your run.
          Everyone who signed up earlier goes straight into the main draw. So
          there are no byes, and a real reason to enter early.
        </Rule>

        <Rule n="12" title="Keep it good-natured">
          Play hard, stay kind: everyone in the draw is a real person, and this
          is a small room. To reach an opponent, use the nudge, which posts a
          friendly poke to them from your own account. Keep the back and forth on
          the timeline rather than in DMs, so it stays public, easy to follow,
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

function Timetable() {
  return (
    <div className="ml-[46px] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)]/60 px-3.5 py-2.5">
        <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
          Entries close <strong className="text-[var(--color-text-primary)]">Thu, 12 PM PT</strong>{" "}
          (3 PM ET). Full 64-player shape below; smaller fields need fewer rounds
          and start later in the week. Your bracket shows every time in your own
          zone.
        </p>
      </div>
      <ul>
        {SCHEDULE.map((s) => (
          <Fragment key={s.r}>
          {s.gap && (
            <li className="flex items-center gap-2 border-b border-[var(--color-border)] px-3.5 py-1.5">
              <span className="ml-[52px] font-[var(--font-mono)] text-[10px] uppercase tracking-[0.15em] text-[var(--color-text-secondary)] opacity-70">
                1-hour break
              </span>
            </li>
          )}
          <li
            className="flex items-center gap-3 border-b border-[var(--color-border)] px-3.5 py-2.5 last:border-b-0"
            style={s.last ? { background: `color-mix(in srgb, ${TOURNEY.accent} 8%, transparent)` } : undefined}
          >
            <span
              className="grid h-6 min-w-[42px] shrink-0 place-items-center rounded-full px-1.5 font-[var(--font-mono)] text-[11px] font-bold"
              style={{
                border: `1px solid color-mix(in srgb, ${TOURNEY.accent} 40%, transparent)`,
                color: TOURNEY.accent,
              }}
            >
              {s.r}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                  {s.name}
                </span>
                <span className="shrink-0 text-xs text-[var(--color-text-secondary)]">{s.day}</span>
              </div>
              <div className="mt-0.5 font-[var(--font-mono)] text-[11px] text-[var(--color-text-secondary)]">
                {s.et} <span className="opacity-50">·</span> {s.pt}
              </div>
            </div>
          </li>
          </Fragment>
        ))}
      </ul>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full font-[var(--font-mono)] text-[10px] font-bold"
        style={{
          border: `1px solid color-mix(in srgb, ${TOURNEY.accent} 40%, transparent)`,
          color: TOURNEY.accent,
        }}
      >
        {n}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
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
        <div className="mt-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">
          {children}
        </div>
      </div>
    </div>
  );
}
