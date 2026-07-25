"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Avatar } from "@/components/ui/Avatar";
import { BackButton } from "@/components/nav/BackButton";
import { Countdown } from "@/components/tournament/Countdown";
import { getTournament, type Tournament, type TournamentMatch, type TournamentPlayer } from "@/lib/api";

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

  const rounds = Math.max(1, t.rounds);
  const r1Count = Math.max(1, t.bracket_size / 2);
  const byRound = (r: number) => t.matches.filter((m) => m.round === r).sort((a, b) => a.slot - b.slot);
  const deadlineFor = (r: number) => t.round_deadlines.find((d) => d.round === r)?.deadline ?? null;
  // The live round is the earliest one still holding an undecided match.
  const activeRound =
    t.matches.filter((m) => m.status !== "done" && m.status !== "bye").sort((a, b) => a.round - b.round)[0]?.round ?? null;

  return (
    <Shell>
      <Header t={t} />

      {t.champion && <ChampionBanner player={t.champion} />}

      {/* Round headers + deadlines, aligned to the columns below. */}
      <div className="mt-8 overflow-x-auto pb-4">
        <div style={{ minWidth: rounds * COL_W + (rounds - 1) * GUTTER }}>
          <div
            className="mb-3 grid"
            style={{ gridTemplateColumns: `repeat(${rounds}, ${COL_W}px)`, columnGap: GUTTER }}
          >
            {Array.from({ length: rounds }, (_, i) => {
              const r = i + 1;
              const dl = deadlineFor(r);
              const live = activeRound === r;
              return (
                <div key={r} className="px-1">
                  <div
                    className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.16em]"
                    style={{ color: live ? "var(--color-warm)" : "var(--color-text-secondary)" }}
                  >
                    {roundName(r, rounds)}
                  </div>
                  {dl && live && (
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
              gridTemplateColumns: `repeat(${rounds}, ${COL_W}px)`,
              gridTemplateRows: `repeat(${r1Count}, ${ROW_H}px)`,
              columnGap: GUTTER,
            }}
          >
            {Array.from({ length: rounds }, (_, i) => i + 1).flatMap((r) =>
              byRound(r).map((m) => {
                const span = 2 ** (r - 1);
                return (
                  <div
                    key={`${r}-${m.slot}`}
                    className="relative flex items-center"
                    style={{ gridColumn: r, gridRow: `${m.slot * span + 1} / span ${span}` }}
                  >
                    {r > 1 && <InThread lit={!!(m.player1 || m.player2)} />}
                    <MatchCard m={m} />
                    {r < rounds && (
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
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2"
        style={{
          right: -GUTTER / 2,
          width: GUTTER / 2,
          height: thickness,
          background: line,
          boxShadow: glow,
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          right: -GUTTER / 2,
          width: thickness,
          background: line,
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
        background: line,
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

function MatchCard({ m }: { m: TournamentMatch }) {
  const live = m.status === "live";
  const done = m.status === "done";
  const bye = m.status === "bye";
  const lone = m.player1 ?? m.player2;
  const [w1, w2] = seriesWins(m);
  const started = w1 + w2 > 0 || (m.results?.length ?? 0) > 0;
  const lines = gameLines(m);

  return (
    <motion.div
      layout
      className="relative w-full rounded-[12px] border"
      style={{
        borderColor: live
          ? "color-mix(in srgb, var(--color-warm) 60%, transparent)"
          : "var(--color-border)",
        background: "var(--color-surface)",
        boxShadow: live ? "0 0 18px color-mix(in srgb, var(--color-warm) 22%, transparent)" : "none",
      }}
    >
      {live && (
        <motion.span
          className="absolute -top-1.5 right-3 rounded-full px-1.5 py-px font-[var(--font-mono)] text-[9px] uppercase tracking-wide"
          style={{ background: "var(--color-warm)", color: "#05060a" }}
          animate={{ opacity: [1, 0.55, 1] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        >
          live
        </motion.span>
      )}

      {bye ? (
        <div className="p-2.5">
          <Slot player={lone} winner />
          <p className="mt-1.5 px-0.5 text-[10px] text-[var(--color-text-secondary)]">
            Bye, straight through
          </p>
        </div>
      ) : (
        <div className="p-2.5">
          <Slot
            player={m.player1}
            winner={done && m.winner_did === m.player1?.did}
            dim={done && m.winner_did !== m.player1?.did}
            wins={started ? w1 : null}
            leading={w1 > w2}
          />
          <div className="my-1 h-px" style={{ background: "var(--color-border)" }} />
          <Slot
            player={m.player2}
            winner={done && m.winner_did === m.player2?.did}
            dim={done && m.winner_did !== m.player2?.did}
            wins={started ? w2 : null}
            leading={w2 > w1}
          />

          {/* The games, with their scorelines. Before this the card showed the
              three names and nothing else, so a fixture two games deep looked
              identical to one that had not started. Scores read in the same
              order as the two players above them. */}
          {lines.length > 0 && (
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
          )}
        </div>
      )}
    </motion.div>
  );
}

function Slot({
  player,
  winner,
  dim,
  wins,
  leading,
}: {
  player: TournamentPlayer | null | undefined;
  winner?: boolean;
  dim?: boolean;
  /** Games won in this series, or null before a ball is kicked. */
  wins?: number | null;
  leading?: boolean;
}) {
  if (!player) {
    return (
      <div className="flex h-[30px] items-center gap-2 py-0.5 pl-2.5 pr-0.5">
        <div className="h-[22px] w-[22px] rounded-full border border-dashed" style={{ borderColor: "var(--color-border)" }} />
        <span className="text-xs text-[var(--color-text-secondary)]">waiting</span>
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
      style={{ opacity: dim ? 0.4 : 1 }}
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
                "linear-gradient(90deg, color-mix(in srgb, var(--color-cyan) 13%, transparent), transparent)",
            }}
          />
        </>
      )}
      <Avatar id={player.did} name={player.display_name} avatarUrl={player.avatar_url} size={22} />
      <span
        className="relative min-w-0 flex-1 truncate text-xs"
        style={{
          color: "var(--color-text-primary)",
          fontWeight: winner ? 700 : 500,
        }}
      >
        {player.display_name}
      </span>
      {wins !== null && wins !== undefined && (
        <span
          className="relative shrink-0 pr-1.5 font-[var(--font-display)] text-[13px] font-bold tabular-nums"
          style={{
            color: leading ? "var(--color-cyan)" : "var(--color-text-secondary)",
          }}
        >
          {wins}
        </span>
      )}
    </div>
  );
}

function ChampionBanner({ player }: { player: TournamentPlayer }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-6 rounded-[18px] border p-5 text-center"
      style={{
        borderColor: "color-mix(in srgb, var(--color-gold) 55%, transparent)",
        background:
          "linear-gradient(160deg, color-mix(in srgb, var(--color-gold) 14%, transparent), transparent 65%), var(--color-surface)",
      }}
    >
      <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.2em]" style={{ color: "var(--color-gold)" }}>
        Champion
      </div>
      <div className="mt-3 flex items-center justify-center gap-3">
        <Avatar id={player.did} name={player.display_name} avatarUrl={player.avatar_url} size={52} />
        <div className="text-left">
          <div className="font-[var(--font-display)] text-2xl font-bold">{player.display_name}</div>
          <div className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
            @{player.handle}
          </div>
        </div>
      </div>
    </motion.div>
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
