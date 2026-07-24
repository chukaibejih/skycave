"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Avatar } from "@/components/ui/Avatar";
import { Countdown } from "@/components/tournament/Countdown";
import { getTournament, type Tournament, type TournamentMatch, type TournamentPlayer } from "@/lib/api";

const POLL_MS = 30_000;

// Bracket geometry. Each round-1 match owns one grid row; a match in round r
// spans 2^(r-1) rows, which centres it exactly between the two matches feeding
// it. That is what makes this read as a bracket rather than three lists.
const ROW_H = 96; // px per round-1 match
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
            style={{ background: "var(--color-primary)", color: "#05060a" }}
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
                    style={{ color: live ? "var(--color-primary)" : "var(--color-text-secondary)" }}
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
                    <MatchCard m={m} />
                    {r < rounds && <Elbow evenSlot={m.slot % 2 === 0} />}
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
function Elbow({ evenSlot }: { evenSlot: boolean }) {
  const line = "color-mix(in srgb, var(--color-border) 90%, transparent)";
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 h-px"
        style={{ right: -GUTTER / 2, width: GUTTER / 2, background: line }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute w-px"
        style={{
          right: -GUTTER / 2,
          background: line,
          ...(evenSlot ? { top: "50%", bottom: 0 } : { top: 0, bottom: "50%" }),
        }}
      />
    </>
  );
}

function MatchCard({ m }: { m: TournamentMatch }) {
  const live = m.status === "live";
  const done = m.status === "done";
  const bye = m.status === "bye";
  const lone = m.player1 ?? m.player2;

  return (
    <motion.div
      layout
      className="relative w-full rounded-[12px] border"
      style={{
        borderColor: live
          ? "color-mix(in srgb, var(--color-primary) 60%, transparent)"
          : "var(--color-border)",
        background: "var(--color-surface)",
        boxShadow: live ? "0 0 18px color-mix(in srgb, var(--color-primary) 22%, transparent)" : "none",
      }}
    >
      {live && (
        <motion.span
          className="absolute -top-1.5 right-3 rounded-full px-1.5 py-px font-[var(--font-mono)] text-[9px] uppercase tracking-wide"
          style={{ background: "var(--color-primary)", color: "#05060a" }}
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
          <Slot player={m.player1} winner={done && m.winner_did === m.player1?.did} dim={done && m.winner_did !== m.player1?.did} />
          <div className="my-1 h-px" style={{ background: "var(--color-border)" }} />
          <Slot player={m.player2} winner={done && m.winner_did === m.player2?.did} dim={done && m.winner_did !== m.player2?.did} />

          {m.game_names.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {m.game_names.map((g, i) => (
                <span
                  key={i}
                  className="rounded-full border px-1.5 py-px font-[var(--font-mono)] text-[9px]"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {g}
                </span>
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
}: {
  player: TournamentPlayer | null | undefined;
  winner?: boolean;
  dim?: boolean;
}) {
  if (!player) {
    return (
      <div className="flex h-[30px] items-center gap-2 px-0.5">
        <div className="h-[22px] w-[22px] rounded-full border border-dashed" style={{ borderColor: "var(--color-border)" }} />
        <span className="text-xs text-[var(--color-text-secondary)]">waiting</span>
      </div>
    );
  }
  return (
    <div className="flex h-[30px] items-center gap-2 px-0.5" style={{ opacity: dim ? 0.42 : 1 }}>
      <Avatar id={player.did} name={player.display_name} avatarUrl={player.avatar_url} size={22} />
      <span
        className="min-w-0 flex-1 truncate text-xs"
        style={{
          color: winner ? "var(--color-text-primary)" : "var(--color-text-primary)",
          fontWeight: winner ? 700 : 500,
        }}
      >
        {player.display_name}
      </span>
      {winner && (
        <span className="shrink-0 text-[10px]" style={{ color: "var(--color-success)" }}>
          ✓
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
          borderColor: "color-mix(in srgb, var(--color-primary) 45%, transparent)",
          color: "var(--color-primary)",
        }}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />
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
      <Link
        href="/"
        className="mb-6 inline-flex h-10 items-center rounded-full border px-4 text-sm text-[var(--color-text-secondary)]"
        style={{ borderColor: "var(--color-border)" }}
      >
        hub
      </Link>
      {children}
    </main>
  );
}
