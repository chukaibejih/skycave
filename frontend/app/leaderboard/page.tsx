"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Avatar } from "@/components/ui/Avatar";
import {
  getLeaderboard,
  listGames,
  type LeaderboardEntry,
  type LeaderboardMode,
  type LeaderboardPeriod,
} from "@/lib/api";
import type { GameInfo } from "@/lib/types";

// "GeoGuess 1v1" reads oddly next to a Solo tab — trim the suffix for labels.
const shortName = (name: string) => name.replace(/\s*1v1$/i, "");

export default function LeaderboardPage() {
  const router = useRouter();
  const [games, setGames] = useState<GameInfo[]>([]);
  const [game, setGame] = useState<string>("");
  const [mode, setMode] = useState<LeaderboardMode>("versus");
  const [period, setPeriod] = useState<LeaderboardPeriod>("week");
  const [cache, setCache] = useState<Record<string, LeaderboardEntry[]>>({});

  useEffect(() => {
    listGames()
      .then((gs) => {
        setGames(gs);
        if (gs[0]) setGame(gs[0].type);
      })
      .catch(() => {});
  }, []);

  const solo = mode === "solo";
  const effPeriod: LeaderboardPeriod = solo ? "all" : period;
  const key = `${mode}:${game}:${effPeriod}`;
  const entries = game ? cache[key] ?? null : null;

  useEffect(() => {
    if (!game || cache[key]) return;
    let active = true;
    getLeaderboard({ game, mode, period: effPeriod, limit: 25 })
      .then((r) => {
        if (active) setCache((c) => ({ ...c, [key]: r.entries }));
      })
      .catch(() => {
        if (active) setCache((c) => ({ ...c, [key]: [] }));
      });
    return () => {
      active = false;
    };
  }, [game, mode, effPeriod, key, cache]);

  const activeGame = games.find((g) => g.type === game);

  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex items-center justify-between">
        <button
          onClick={() => router.push("/")}
          aria-label="Back"
          className="grid h-12 w-12 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/70 text-[var(--color-text-secondary)] active:text-[var(--color-text-primary)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
        </button>
        <div className="text-center">
          <div className="font-[var(--font-display)] text-2xl font-bold">
            Leader<span className="text-[var(--color-primary)]">board</span>
          </div>
          <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
            {activeGame ? shortName(activeGame.name) : "top players"}
          </div>
        </div>
        <div className="w-12" />
      </header>

      {/* Game selector */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {games.map((g) => (
          <button
            key={g.type}
            onClick={() => setGame(g.type)}
            className="shrink-0 rounded-full border px-3.5 py-2 text-sm transition-colors"
            style={{
              borderColor: g.type === game ? "var(--color-primary)" : "var(--color-border)",
              color: g.type === game ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              background: g.type === game ? "color-mix(in srgb, var(--color-primary) 16%, transparent)" : "transparent",
            }}
          >
            {shortName(g.name)}
          </button>
        ))}
      </div>

      {/* Mode + period */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {(["versus", "solo"] as LeaderboardMode[]).map((m) => (
            <Toggle key={m} on={mode === m} onClick={() => setMode(m)}>
              {m === "versus" ? "1v1" : "Solo"}
            </Toggle>
          ))}
        </div>
        {!solo && (
          <div className="flex gap-2">
            {(["week", "all"] as LeaderboardPeriod[]).map((p) => (
              <Toggle key={p} on={period === p} onClick={() => setPeriod(p)} subtle>
                {p === "week" ? "This week" : "All time"}
              </Toggle>
            ))}
          </div>
        )}
      </div>

      {entries === null ? (
        <p className="py-16 text-center text-sm text-[var(--color-text-secondary)]">loading…</p>
      ) : entries.length === 0 ? (
        <div className="rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-16 text-center">
          <div className="font-[var(--font-display)] text-xl font-semibold">
            {solo
              ? "No solo scores yet."
              : period === "week"
                ? "No 1v1 games this week."
                : "No 1v1 games yet."}
          </div>
          <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--color-text-secondary)]">
            Log in with Bluesky and play {activeGame ? shortName(activeGame.name) : "a game"} to
            claim the top spot. Guests aren&apos;t ranked.
          </p>
          <button
            onClick={() => router.push("/")}
            style={{ backgroundColor: "var(--color-primary)", color: "#05060a" }}
            className="mt-6 inline-flex h-11 items-center justify-center rounded-[var(--radius-button)] px-6 text-sm font-semibold"
          >
            Play now
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[16px] border border-[var(--color-border)]">
          {entries.map((e, i) => (
            <motion.div
              key={e.did}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.4) }}
              className="border-t border-[var(--color-border)] first:border-t-0"
            >
            <Link
              href={`/u/${e.handle}`}
              className="flex items-center gap-3 bg-[var(--color-surface)] px-3 py-3 transition-colors hover:bg-[var(--color-elevated)] active:bg-[var(--color-elevated)] sm:px-4"
            >
              <div className="w-7 shrink-0 text-center font-[var(--font-display)] text-lg font-bold" style={{ color: rankColor(e.rank) }}>
                {e.rank}
              </div>
              <Avatar id={e.did} name={e.display_name ?? e.handle} avatarUrl={e.avatar_url} size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-[var(--font-display)] font-semibold">
                  {e.display_name ?? e.handle}
                </div>
                <div className="truncate font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
                  @{e.handle}
                </div>
              </div>
              {/* Stats: 1v1 shows played/won on wider screens; solo shows plays */}
              <div className="hidden text-right sm:block">
                {solo ? (
                  <div className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
                    {e.games_played} {e.games_played === 1 ? "run" : "runs"}
                  </div>
                ) : (
                  <>
                    <div className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
                      {e.games_won} won · {e.games_played} played
                    </div>
                    <div className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
                      {Math.round(e.win_rate * 100)}% win
                    </div>
                  </>
                )}
              </div>
              <div className="w-16 shrink-0 text-right sm:w-20">
                <div className="font-[var(--font-display)] text-lg font-bold text-[var(--color-primary)]">
                  {solo ? e.total_score.toLocaleString() : e.games_won}
                </div>
                <div className="font-[var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
                  {solo ? "best" : "wins"}
                </div>
              </div>
            </Link>
            </motion.div>
          ))}
        </div>
      )}

      <p className="mt-4 text-center font-[var(--font-mono)] text-[11px] text-[var(--color-text-secondary)]">
        {solo
          ? "best single-run score"
          : period === "week"
            ? "1v1 wins from the last 7 days"
            : "1v1 wins, all time"}
      </p>
    </main>
  );
}

function Toggle({
  on,
  onClick,
  subtle,
  children,
}: {
  on: boolean;
  onClick: () => void;
  subtle?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border px-4 py-2 text-sm transition-colors"
      style={{
        borderColor: on ? "var(--color-primary)" : "var(--color-border)",
        color: on ? "var(--color-text-primary)" : "var(--color-text-secondary)",
        background: on
          ? `color-mix(in srgb, var(--color-primary) ${subtle ? 12 : 18}%, transparent)`
          : "transparent",
      }}
    >
      {children}
    </button>
  );
}

// Gold / silver / bronze for the podium, muted otherwise.
function rankColor(rank: number): string {
  if (rank === 1) return "var(--color-gold)";
  if (rank === 2) return "#cbd5e1";
  if (rank === 3) return "#e0a678";
  return "var(--color-text-secondary)";
}
