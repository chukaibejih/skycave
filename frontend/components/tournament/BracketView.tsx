"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Avatar } from "@/components/ui/Avatar";
import { BackButton } from "@/components/nav/BackButton";
import { Countdown, LocalTime } from "@/components/tournament/Countdown";
import {
  getTournament,
  getMyMatch,
  type Tournament,
  type TournamentMatch,
  type TournamentPlayer,
  type MyMatch,
} from "@/lib/api";

const POLL_MS = 30_000;

// Bracket geometry. Each round-1 match owns one grid row; a match in round r
// spans 2^(r-1) rows, which centres it exactly between the two matches feeding
// it. That is what makes this read as a bracket rather than three lists.
const ROW_H = 172; // px per round-1 match: tallest card (two players + game
                   // pills) plus breathing room, so nothing crowds or spills
const COL_W = 216;
const GUTTER = 26;

export function BracketView({ id }: { id: string }) {
  const [t, setT] = useState<Tournament | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    try {
      setT(await getTournament(id));
    } catch {
      setMissing(true);
    }
  }, [id]);

  useEffect(() => {
    load();
    const iv = setInterval(load, POLL_MS);
    return () => clearInterval(iv);
  }, [load]);

  if (missing) {
    return (
      <Shell>
        <p className="text-center text-[var(--color-text-secondary)]">
          That tournament is not here.
        </p>
      </Shell>
    );
  }
  if (!t) {
    return (
      <Shell>
        <p className="text-center text-[var(--color-text-secondary)]">Loading the bracket...</p>
      </Shell>
    );
  }

  // Before the draw there is no bracket to show, so send people to the door.
  if (t.status === "registering") {
    return (
      <Shell>
        <Header t={t} />
        <div
          className="mt-8 rounded-[18px] border p-6 text-center"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          <p className="font-[var(--font-display)] text-xl font-bold">
            The bracket is not drawn yet.
          </p>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            It goes up the moment entries close, with every fixture and its three games.
          </p>
          <div className="mt-4">
            <Countdown to={t.registration_closes_at} onElapsed={load} />
          </div>
          <Link
            href="/tournament"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-[14px] px-6 font-semibold"
            style={{ background: "var(--color-warm)", color: "#05060a" }}
          >
            Take a spot
          </Link>
        </div>
      </Shell>
    );
  }

  // The play-in (round 0) is a pre-draw qualifier for the overflow above the
  // nearest power of two. It gets its own section; the main draw is rounds 1..N.
  const playIn = t.matches.filter((m) => m.round === 0).sort((a, b) => a.slot - b.slot);
  const hasPlayIn = playIn.length > 0;
  const mainRounds = Math.max(1, hasPlayIn ? t.rounds - 1 : t.rounds);
  const r1Count = Math.max(1, t.bracket_size / 2);
  const byRound = (r: number) => t.matches.filter((m) => m.round === r).sort((a, b) => a.slot - b.slot);
  const deadlineFor = (r: number) => t.round_deadlines.find((d) => d.round === r)?.deadline ?? null;
  // The live round is the earliest one still holding an undecided match.
  const activeRound =
    t.matches.filter((m) => m.status !== "done" && m.status !== "bye").sort((a, b) => a.round - b.round)[0]?.round ?? null;
  // Before play opens the round deadline is not counting down on anyone yet, so
  // showing "closes in..." next to it just reads as a second, confusing clock.
  const playOpen = Date.now() >= new Date(t.play_opens_at).getTime();

  return (
    <Shell>
      <style>{`
        @keyframes flow-h {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes flow-v-down {
          0% { background-position: 0 -200%; }
          100% { background-position: 0 200%; }
        }
        @keyframes flow-v-up {
          0% { background-position: 0 200%; }
          100% { background-position: 0 -200%; }
        }
      `}</style>
      <Header t={t} />

      {t.status !== "finished" && <PlayStrip t={t} />}

      {t.champion && <ChampionBanner player={t.champion} />}

      {hasPlayIn && (
        <PlayInPanel
          matches={playIn}
          deadline={deadlineFor(0)}
          live={activeRound === 0}
          playOpen={playOpen}
          youDid={t.you?.did ?? null}
          tournamentId={id}
        />
      )}

      {/* The main draw. Round headers + deadlines, aligned to the columns below. */}
      <div className="mt-8 overflow-x-auto pb-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {hasPlayIn && (
          <div className="mb-3 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
            The main draw
          </div>
        )}
        <div style={{ minWidth: mainRounds * COL_W + (mainRounds - 1) * GUTTER }}>
          <div
            className="mb-3 grid"
            style={{ gridTemplateColumns: `repeat(${mainRounds}, ${COL_W}px)`, columnGap: GUTTER }}
          >
            {Array.from({ length: mainRounds }, (_, i) => {
              const r = i + 1;
              const dl = deadlineFor(r);
              const live = activeRound === r;
              return (
                <div key={r} className="px-1">
                  <div
                    className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.16em]"
                    style={{ color: live ? "var(--color-warm)" : "var(--color-text-secondary)" }}
                  >
                    {roundName(r, mainRounds)}
                  </div>
                  {dl && live && playOpen && (
                    <div className="mt-0.5 text-[11px] text-[var(--color-text-secondary)]">
                      closes in <Countdown to={dl} compact />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* The bracket itself. */}
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${mainRounds}, ${COL_W}px)`,
              gridTemplateRows: `repeat(${r1Count}, ${ROW_H}px)`,
              columnGap: GUTTER,
            }}
          >
            {Array.from({ length: mainRounds }, (_, i) => i + 1).flatMap((r) =>
              byRound(r).map((m) => {
                const span = 2 ** (r - 1);
                return (
                  <div
                    key={`${r}-${m.slot}`}
                    className="relative flex items-center"
                    style={{ gridColumn: r, gridRow: `${m.slot * span + 1} / span ${span}` }}
                  >
                    {r > 1 && <InThread lit={!!(m.player1 || m.player2)} />}
                    <MatchCard m={m} emptyLabel={r === 1 && hasPlayIn ? "play-in winner" : undefined} tournamentId={id} />
                    {r < mainRounds && (
                      <Elbow evenSlot={m.slot % 2 === 0} lit={!!m.winner_did} />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <p className="mt-2 text-center text-xs text-[var(--color-text-secondary)]">
        Scroll sideways to follow the bracket.
      </p>
    </Shell>
  );
}

/**
 * The connector into the next round.
 *
 * A match in round r+1 is centred across the two cells feeding it, so its
 * centre sits exactly on the boundary between them. Drawing a stub out to the
 * gutter and then a vertical run from this card's centre to that boundary
 * (downward from the top match, upward from the bottom one) makes the two
 * halves meet precisely where the next card is.
 */
function Elbow({ evenSlot, lit }: { evenSlot: boolean; lit: boolean }) {
  const line = lit
    ? "var(--color-cyan)"
    : "color-mix(in srgb, var(--color-border) 90%, transparent)";
  const glow = lit ? "0 0 7px var(--color-cyan)" : "none";
  const thickness = lit ? 2 : 1;
  return (
    <>
      {/* Horizontal run */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2"
        style={{
          right: -GUTTER / 2,
          width: GUTTER / 2,
          height: thickness,
          background: lit ? `linear-gradient(90deg, transparent, var(--color-cyan) 50%, transparent)` : line,
          backgroundSize: lit ? "200% 100%" : "auto",
          animation: lit ? "flow-h 2s linear infinite" : "none",
          boxShadow: glow,
        }}
      />
      {/* Vertical run */}
      <span
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          right: -GUTTER / 2,
          width: thickness,
          background: lit ? `linear-gradient(180deg, transparent, var(--color-cyan) 50%, transparent)` : line,
          backgroundSize: lit ? "100% 200%" : "auto",
          animation: lit ? (evenSlot ? "flow-v-down 2s linear infinite" : "flow-v-up 2s linear infinite") : "none",
          boxShadow: glow,
          ...(evenSlot ? { top: "50%", bottom: 0 } : { top: 0, bottom: "50%" }),
        }}
      />
    </>
  );
}

/** The thread arriving into a match, so the run reads as one continuous line. */
function InThread({ lit }: { lit: boolean }) {
  const line = lit
    ? "var(--color-cyan)"
    : "color-mix(in srgb, var(--color-border) 90%, transparent)";
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-1/2"
      style={{
        left: -GUTTER / 2,
        width: GUTTER / 2,
        height: lit ? 2 : 1,
        background: lit ? `linear-gradient(90deg, transparent, var(--color-cyan) 50%, transparent)` : line,
        backgroundSize: lit ? "200% 100%" : "auto",
        animation: lit ? "flow-h 2.5s linear infinite" : "none",
        boxShadow: lit ? "0 0 7px var(--color-cyan)" : "none",
      }}
    />
  );
}

/** One game played inside a fixture, as the API records it. */
interface Leg {
  game_type: string;
  winner: string | null;
  p1_score: number;
  p2_score: number;
  replay?: boolean;
}

/**
 * Fold a fixture's played games onto its three drawn ones.
 *
 * A drawn game is replayed rather than moving the series on, so results and
 * games are not one to one: two rows of `results` can belong to the same game.
 * Walking them in order and only advancing on a decisive leg is what keeps a
 * replay attached to the game it belongs to instead of shunting every later
 * score one slot down.
 */
function gameLines(m: TournamentMatch) {
  const legs = (m.results ?? []) as unknown as Leg[];
  const rows = m.games.map((g, i) => ({
    name: m.game_names[i] ?? g,
    score: null as string | null,
    played: false,
    replayed: false,
    p1Won: false,
    current: false,
  }));
  let at = 0;
  for (const leg of legs) {
    const row = rows[Math.min(at, rows.length - 1)];
    if (!row) break;
    if (leg.replay) {
      row.replayed = true;
      continue;
    }
    // A score only when both sides are real numbers. Some games are decided by
    // a winner with no running tally (and older results predate scores being
    // stored at all), where "undefined-undefined" is worse than no score.
    const p1 = leg.p1_score;
    const p2 = leg.p2_score;
    row.score =
      Number.isFinite(p1) && Number.isFinite(p2) && (p1 || p2)
        ? `${p1}-${p2}`
        : null;
    row.played = true;
    row.p1Won = !!leg.winner && leg.winner === m.player1?.did;
    at++;
  }
  if (!m.winner_did && rows[at]) rows[at].current = true;
  return rows;
}

function seriesWins(m: TournamentMatch): [number, number] {
  const legs = (m.results ?? []) as unknown as Leg[];
  return [
    legs.filter((l) => l.winner && l.winner === m.player1?.did).length,
    legs.filter((l) => l.winner && l.winner === m.player2?.did).length,
  ];
}

/**
 * The player who forfeited this fixture, if any. You cannot play a series
 * without checking in, so a decided match whose loser never appears in
 * `checked_in` was awarded past the deadline, not won on the board: the loser
 * did not show. A bye is not a forfeit (there was simply no opponent to face),
 * and an unresolved match has no loser yet. Marking the absent side lets anyone
 * reading the bracket see that their opponent advanced on a walkover.
 */
function forfeitedDid(m: TournamentMatch): string | null {
  if (m.status === "bye" || !m.winner_did) return null;
  const loser = m.winner_did === m.player1?.did ? m.player2 : m.player1;
  if (!loser) return null;
  return (m.checked_in ?? []).includes(loser.did) ? null : loser.did;
}

function MatchCard({
  m,
  emptyLabel,
  tournamentId,
}: {
  m: TournamentMatch;
  emptyLabel?: string;
  tournamentId?: string;
}) {
  const live = m.status === "live";
  const inPlay = !!m.in_play; // a game is actually being played, not just checked in
  const done = m.status === "done";
  const [w1, w2] = seriesWins(m);
  const started = w1 + w2 > 0 || (m.results?.length ?? 0) > 0;
  const lines = gameLines(m);
  const forfeiter = forfeitedDid(m);

  // A seat decided without a single game on the board. A no-show is already
  // covered by the FORFEIT badge; this is the other case - both sides checked
  // in (or neither did) but nobody played, so the deadline awarded it on a
  // tiebreak. The planned game list would otherwise show three dashes next to a
  // highlighted winner, which reads as "not started" rather than "already over".
  const noContest =
    !!m.winner_did && m.status !== "bye" && (m.results?.length ?? 0) === 0 && !forfeiter;
  const checkedIn = m.checked_in ?? [];
  const bothChecked =
    !!m.player1 &&
    !!m.player2 &&
    checkedIn.includes(m.player1.did) &&
    checkedIn.includes(m.player2.did);
  const tiebreakReason = bothChecked
    ? "Both checked in but nobody played before the deadline, so the seat went to whoever checked in first."
    : "Nobody checked in or played before the deadline, so the seat went to the higher seed.";

  return (
    <motion.div
      layout
      className="relative w-full rounded-[12px] border bg-[var(--color-surface)]/60 backdrop-blur-md"
      style={{
        borderColor: live
          ? "color-mix(in srgb, var(--color-warm) 60%, transparent)"
          : "rgba(255, 255, 255, 0.1)",
        boxShadow: live ? "0 0 18px color-mix(in srgb, var(--color-warm) 22%, transparent)" : "none",
      }}
    >
      {inPlay ? (
        // A game is genuinely on: the pulsing solid LIVE badge.
        <motion.span
          className="absolute -top-1.5 right-3 rounded-full px-1.5 py-px font-[var(--font-mono)] text-[9px] uppercase tracking-wide"
          style={{ background: "var(--color-warm)", color: "#05060a" }}
          animate={{ opacity: [1, 0.55, 1] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        >
          live
        </motion.span>
      ) : live ? (
        // Both checked in, but no game running yet: a calm, static chip.
        <span
          className="absolute -top-1.5 right-3 rounded-full border px-1.5 py-px font-[var(--font-mono)] text-[9px] uppercase tracking-wide"
          style={{
            borderColor: "color-mix(in srgb, var(--color-warm) 55%, transparent)",
            background: "var(--color-surface)",
            color: "var(--color-warm)",
          }}
        >
          checking in
        </span>
      ) : null}

      <div className="p-2.5">
          <Slot
            player={m.player1}
            winner={done && m.winner_did === m.player1?.did}
            dim={done && m.winner_did !== m.player1?.did}
            wins={started ? w1 : null}
            leading={w1 > w2}
            forfeit={!!m.player1 && forfeiter === m.player1.did}
            emptyLabel={emptyLabel}
          />
          <div className="my-1 h-px" style={{ background: "var(--color-border)" }} />
          <Slot
            player={m.player2}
            winner={done && m.winner_did === m.player2?.did}
            dim={done && m.winner_did !== m.player2?.did}
            wins={started ? w2 : null}
            leading={w2 > w1}
            forfeit={!!m.player2 && forfeiter === m.player2.did}
            emptyLabel={emptyLabel}
          />

          {/* The games, with their scorelines. Before this the card showed the
              three names and nothing else, so a fixture two games deep looked
              identical to one that had not started. Scores read in the same
              order as the two players above them. */}
          {noContest ? (
            <div
              title={tiebreakReason}
              className="mt-2 flex items-center gap-1.5 rounded-[5px] px-1.5 py-1 font-[var(--font-mono)] text-[9px] uppercase tracking-wide"
              style={{
                background: "color-mix(in srgb, var(--color-text-secondary) 12%, transparent)",
                color: "var(--color-text-secondary)",
              }}
            >
              no games played · won on tiebreak
            </div>
          ) : lines.length > 0 ? (
            <div className="mt-2 flex flex-col gap-0.5">
              {lines.map((g, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 rounded-[5px] px-1 py-[3px]"
                  style={{
                    background: g.current
                      ? "color-mix(in srgb, var(--color-cyan) 10%, transparent)"
                      : "transparent",
                    opacity: g.score || g.played || g.current ? 1 : 0.45,
                  }}
                >
                  <span
                    className="min-w-0 flex-1 truncate font-[var(--font-mono)] text-[9px]"
                    style={{
                      color: g.current ? "var(--color-cyan)" : "var(--color-text-secondary)",
                    }}
                  >
                    {g.name}
                    {/* A game that was drawn and played again. The glyph is a
                        replay arrow rather than a word: at 9px in a 216px column
                        there is no room for "replayed", and an abbreviation is
                        just a word nobody can read. */}
                    {g.replayed && <span title="drawn, then replayed"> &#8635;</span>}
                  </span>
                  <span
                    className="shrink-0 font-[var(--font-mono)] text-[9px] tabular-nums"
                    style={{
                      color: g.score
                        ? "var(--color-text-primary)"
                        : g.played
                          ? "var(--color-success)"
                          : g.current
                            ? "var(--color-cyan)"
                            : "var(--color-text-secondary)",
                      fontWeight: g.score ? 700 : 400,
                    }}
                  >
                    {/* A played leg with no stored score still reads as played
                        (a check), never as a blank that looks unstarted. */}
                    {g.score ?? (g.played ? "✓" : g.current ? "now" : "-")}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {/* Watch: present once both are in, but only enabled once a game is
              actually on (in_play). While "checking in" it shows disabled so
              people can see it's coming without landing on an empty room. */}
          {live && tournamentId && (
            inPlay ? (
              <Link
                href={`/tournament/${tournamentId}/watch/${m.round}/${m.slot}`}
                className="mt-2 flex items-center justify-center gap-1.5 rounded-[7px] border py-1.5 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.12em] transition-[filter] active:brightness-95"
                style={{
                  borderColor: "color-mix(in srgb, var(--color-warm) 45%, transparent)",
                  background: "color-mix(in srgb, var(--color-warm) 10%, transparent)",
                  color: "var(--color-warm)",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Watch
              </Link>
            ) : (
              <div
                aria-disabled
                className="mt-2 flex cursor-not-allowed items-center justify-center gap-1.5 rounded-[7px] border py-1.5 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.12em] opacity-45"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Watch
              </div>
            )
          )}
        </div>
    </motion.div>
  );
}

function Slot({
  player,
  winner,
  dim,
  wins,
  leading,
  forfeit,
  emptyLabel,
}: {
  player: TournamentPlayer | null | undefined;
  winner?: boolean;
  dim?: boolean;
  /** Games won in this series, or null before a ball is kicked. */
  wins?: number | null;
  leading?: boolean;
  /** This player never showed and lost the fixture by walkover. */
  forfeit?: boolean;
  /** Text for an empty seat: 'waiting' (a later round) or 'play-in winner'. */
  emptyLabel?: string;
}) {
  if (!player) {
    const fromPlayIn = !!emptyLabel;
    return (
      <div className="flex h-[30px] items-center gap-2 py-0.5 pl-2.5 pr-0.5">
        <div
          className="h-[22px] w-[22px] rounded-full border border-dashed"
          style={{
            borderColor: fromPlayIn
              ? "color-mix(in srgb, var(--color-gold) 55%, transparent)"
              : "var(--color-border)",
          }}
        />
        <span
          className="text-xs"
          style={{ color: fromPlayIn ? "var(--color-gold)" : "var(--color-text-secondary)" }}
        >
          {emptyLabel ?? "waiting"}
        </span>
      </div>
    );
  }
  return (
    // The thread runs through the player who advanced: a lit rail down their
    // side of the card, picking up the same neon as the connectors, so a run
    // through the bracket reads as one continuous line rather than a row of
    // ticks you have to decode.
    <div
      className="relative flex h-[30px] items-center gap-2 rounded-r-[6px] py-0.5 pl-2.5 pr-0.5"
      // A forfeiter is still de-emphasised, but lifted enough that the reason
      // (the badge) stays legible rather than fading out with them.
      style={{ opacity: forfeit ? 0.62 : dim ? 0.4 : 1 }}
    >
      {winner && (
        <>
          <span
            aria-hidden
            className="absolute left-0 top-0.5 bottom-0.5 w-[2px] rounded-full"
            style={{ background: "var(--color-cyan)", boxShadow: "0 0 7px var(--color-cyan)" }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-1/2 rounded-r-[6px]"
            style={{
              background:
                "linear-gradient(90deg, color-mix(in srgb, var(--color-cyan) 30%, transparent), transparent)",
            }}
          />
        </>
      )}
      <Link
        href={`/u/${player.handle}`}
        className="relative flex min-w-0 flex-1 items-center gap-2 transition-opacity hover:opacity-80"
        title={`@${player.handle}`}
      >
        <Avatar id={player.did} name={player.display_name} avatarUrl={player.avatar_url} size={22} />
        <span
          className="min-w-0 flex-1 truncate text-xs"
          style={{
            color: "var(--color-text-primary)",
            fontWeight: winner ? 700 : 500,
          }}
        >
          {player.display_name}
        </span>
      </Link>
      {forfeit ? (
        // Where the score would sit, name the reason this side lost: they never
        // turned up, so the fixture was awarded past the deadline.
        <span
          className="relative shrink-0 rounded-[4px] border px-1.5 py-px font-[var(--font-mono)] text-[8px] uppercase tracking-[0.08em]"
          style={{
            color: "var(--color-warm)",
            borderColor: "color-mix(in srgb, var(--color-warm) 45%, transparent)",
            background: "color-mix(in srgb, var(--color-warm) 12%, transparent)",
          }}
        >
          forfeit
        </span>
      ) : wins !== null && wins !== undefined ? (
        <span
          className="relative shrink-0 pr-1.5 font-[var(--font-display)] text-[13px] font-bold tabular-nums"
          style={{
            color: leading ? "var(--color-cyan)" : "var(--color-text-secondary)",
          }}
        >
          {wins}
        </span>
      ) : null}
    </div>
  );
}

function ChampionBanner({ player }: { player: TournamentPlayer }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative mb-4 mt-8 flex flex-col items-center justify-center"
    >
      <div className="absolute inset-0 rounded-[24px] bg-[var(--color-gold)] opacity-10 blur-2xl" />
      <div
        className="relative flex w-full max-w-sm flex-col items-center overflow-hidden rounded-[24px] border border-white/20 bg-black/40 p-8 backdrop-blur-xl"
        style={{
          boxShadow: "0 20px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)",
        }}
      >
        <motion.div
          className="pointer-events-none absolute -left-32 -top-32 h-[300px] w-[300px] rounded-full opacity-30 mix-blend-screen"
          style={{ background: "radial-gradient(circle, var(--color-gold) 0%, transparent 70%)" }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="relative z-10 font-[var(--font-mono)] text-[12px] uppercase tracking-[0.2em] text-[var(--color-gold)] drop-shadow-md">
          Champion
        </div>
        <div className="relative z-10 mt-5 flex flex-col items-center gap-3">
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <Avatar id={player.did} name={player.display_name} avatarUrl={player.avatar_url} size={72} />
          </motion.div>
          <div className="mt-2 text-center">
            <div className="font-[var(--font-display)] text-3xl font-bold text-white drop-shadow-lg">{player.display_name}</div>
            <div className="font-[var(--font-mono)] text-sm text-white/70">
              @{player.handle}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** A "log in / enter" glyph: an arrow stepping through a doorway. The play-in is
 * the door into the main draw, so the section wears it. */
function GateIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
    </svg>
  );
}

/**
 * The play-in: a distinct, gold-accented gate that sits above the main bracket
 * rather than posing as a normal round. It says plainly who is in it and what
 * is at stake (a seat in the main draw), highlights the viewer's own match, and
 * shares the gold of the "play-in winner" seats below so the eye connects the
 * qualifier to where its winners land. A power-of-two field never renders this.
 */
function PlayInPanel({
  matches,
  deadline,
  live,
  playOpen,
  youDid,
  tournamentId,
}: {
  matches: TournamentMatch[];
  deadline: string | null;
  live: boolean;
  playOpen: boolean;
  youDid: string | null;
  tournamentId: string;
}) {
  const seats = matches.length;
  const GOLD = "var(--color-gold)";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-6 rounded-[18px] border p-4"
      style={{
        borderColor: "color-mix(in srgb, var(--color-gold) 38%, transparent)",
        background:
          "linear-gradient(155deg, color-mix(in srgb, var(--color-gold) 9%, transparent), transparent 58%), var(--color-surface)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div
            className="flex items-center gap-2 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.18em]"
            style={{ color: GOLD }}
          >
            <GateIcon /> Play-in
            {live && (
              <motion.span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: GOLD }}
                animate={{ opacity: [1, 0.35, 1] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              />
            )}
          </div>
          <p className="mt-1.5 max-w-md text-xs leading-relaxed text-[var(--color-text-secondary)]">
            The last to register play their way in. Win your match and you take
            one of the {seats} open {seats === 1 ? "seat" : "seats"} in the main
            draw below.
          </p>
        </div>
        {deadline && live && playOpen && (
          <div className="shrink-0 text-[11px] text-[var(--color-text-secondary)]">
            closes in <Countdown to={deadline} compact />
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {matches.map((m) => {
          const mine = !!youDid && (m.player1?.did === youDid || m.player2?.did === youDid);
          return (
            <div key={m.slot} className="relative" style={{ width: COL_W }}>
              {mine && (
                <span
                  className="absolute -top-2 left-3 z-10 rounded-full px-1.5 py-px font-[var(--font-mono)] text-[9px] uppercase tracking-wide"
                  style={{ background: GOLD, color: "#05060a" }}
                >
                  you
                </span>
              )}
              <MatchCard m={m} tournamentId={tournamentId} />
              <div
                className="mt-1 flex items-center justify-center gap-1 font-[var(--font-mono)] text-[9px] uppercase tracking-[0.12em]"
                style={{ color: "color-mix(in srgb, var(--color-gold) 85%, transparent)" }}
              >
                winner &rarr; a main-draw seat
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

/**
 * The one strip that answers "can I play, and when". Before the play window it
 * counts down to the start with a deactivated button. Once open, it reflects the
 * viewer's actual standing (out, through, champion, or a live fixture) via
 * my-match, so an eliminated player is never told to go play. Spectators just
 * see that play is live.
 */
function PlayStrip({ t }: { t: Tournament }) {
  const opensAt = new Date(t.play_opens_at).getTime();
  const [open, setOpen] = useState(Date.now() >= opensAt);
  const [mine, setMine] = useState<MyMatch | null | undefined>(undefined);

  useEffect(() => {
    if (!open || !t.you_registered) {
      setMine(null);
      return;
    }
    let alive = true;
    const load = () =>
      getMyMatch(t.id)
        .then((m) => alive && setMine(m))
        .catch(() => alive && setMine(null));
    load();
    const iv = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [open, t.id, t.you_registered]);

  const btnBase =
    "inline-flex h-11 shrink-0 items-center justify-center rounded-[13px] px-5 text-sm font-bold";
  const S = "var(--color-success)";

  // The line, and whether there is a match to actually play right now.
  let line: React.ReactNode;
  let canPlay = false;
  if (!open) {
    line = (
      <span>
        Play opens <LocalTime iso={t.play_opens_at} /> ·{" "}
        <span className="tabular-nums text-[var(--color-text-primary)]">
          <Countdown to={t.play_opens_at} compact onElapsed={() => setOpen(true)} />
        </span>
      </span>
    );
  } else if (!t.you_registered || mine === undefined) {
    line = <span style={{ color: S }}>Play is live.</span>; // spectator, or still loading
  } else if (mine?.is_champion) {
    line = <span style={{ color: "var(--color-gold)" }}>You won the Cup.</span>;
  } else if (mine?.eliminated) {
    line = (
      <span style={{ color: "var(--color-text-secondary)" }}>
        {mine.round === 0
          ? "You are out. The play-in was as far as it went. Good run."
          : "You are out. Good run."}
      </span>
    );
  } else if (mine?.won_match || mine?.is_bye) {
    line = <span style={{ color: S }}>You are through. Next opponent still to be decided.</span>;
  } else if (mine && !mine.opponent) {
    line = (
      <span style={{ color: "var(--color-text-secondary)" }}>
        Waiting on the match that feeds yours.
      </span>
    );
  } else if (mine) {
    // A play-in player is fighting for a seat, not yet in the main draw - name
    // the stakes so it reads as the qualifier it is.
    line =
      mine.round === 0 ? (
        <span style={{ color: "var(--color-gold)" }}>
          You are in the play-in. Win to reach the main draw.
        </span>
      ) : (
        <span style={{ color: S }}>Play is live. Go and play your match.</span>
      );
    canPlay = true;
  } else {
    line = <span style={{ color: S }}>Play is live.</span>;
  }

  return (
    <div
      className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[16px] border p-4"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <div className="text-sm font-semibold">{line}</div>

      {t.you_registered && !open && (
        <span
          aria-disabled
          className={`${btnBase} cursor-not-allowed`}
          style={{ background: "var(--color-elevated)", color: "var(--color-text-secondary)", opacity: 0.7 }}
        >
          Play your match
        </span>
      )}
      {t.you_registered && open && canPlay && (
        <Link
          href={`/tournament/${t.id}/match`}
          className={btnBase}
          style={{ background: S, color: "#05060a" }}
        >
          Play your match →
        </Link>
      )}
    </div>
  );
}

function Header({ t }: { t: Tournament }) {
  const label =
    t.status === "finished"
      ? "Done"
      : t.status === "in_progress"
        ? "Playing now"
        : t.status === "locked"
          ? "Bracket set"
          : "Entries open";
  return (
    <div className="text-center">
      <span
        className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.18em]"
        style={{
          borderColor: "color-mix(in srgb, var(--color-warm) 45%, transparent)",
          color: "var(--color-warm)",
        }}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-warm)]" />
        {label}
      </span>
      <h1 className="mt-3 font-[var(--font-display)] text-3xl font-bold leading-tight">{t.name}</h1>
      <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
        {t.entrants} in the draw, {t.rounds} {t.rounds === 1 ? "round" : "rounds"} to a champion
      </p>
    </div>
  );
}

function roundName(r: number, total: number): string {
  if (r === total) return "Final";
  if (r === total - 1) return "Semis";
  if (r === total - 2) return "Quarters";
  return `Round ${r}`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-3xl px-4 pb-16 pt-8">
      <div className="mb-6">
        <BackButton href="/tournament" label="Tournament" />
      </div>
      {children}
    </main>
  );
}
