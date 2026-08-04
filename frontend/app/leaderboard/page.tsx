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

// "GeoGuess 1v1" reads oddly next to a Solo tab - trim the suffix for labels.
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

  // Clay is scored cumulatively: every play (daily, solo, 1v1) adds to one
  // running total, so it has no 1v1/Solo split.
  const cumulative = game === "clay";
  useEffect(() => {
    setMode(cumulative ? "total" : "versus");
  }, [cumulative]);

  const solo = mode === "solo";
  const total = mode === "total";
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
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <div className="flex rounded-full border border-white/5 bg-black/40 p-1 shadow-inner backdrop-blur-md">
          {games.map((g) => (
            <button
              key={g.type}
              onClick={() => setGame(g.type)}
              className="relative shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
              style={{
                color: g.type === game ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                background: g.type === game ? "var(--color-surface)" : "transparent",
                boxShadow: g.type === game ? "0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)" : "none",
                border: g.type === game ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
              }}
            >
              {shortName(g.name)}
            </button>
          ))}
        </div>
      </div>

      {/* Mode + period */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex rounded-full border border-white/5 bg-black/40 p-1 shadow-inner backdrop-blur-md">
          {cumulative ? (
            <Toggle on onClick={() => setMode("total")}>
              Total points
            </Toggle>
          ) : (
            (["versus", "solo"] as LeaderboardMode[]).map((m) => (
              <Toggle key={m} on={mode === m} onClick={() => setMode(m)}>
                {m === "versus" ? "1v1" : "Solo"}
              </Toggle>
            ))
          )}
        </div>
        {!solo && (
          <div className="flex rounded-full border border-white/5 bg-black/40 p-1 shadow-inner backdrop-blur-md">
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
            {total
              ? period === "week"
                ? "No points scored this week."
                : "No points scored yet."
              : solo
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
        <div className="flex flex-col gap-8">
          {/* PODIUM (Top 3) */}
          <div className="flex flex-row items-end justify-center gap-2 pt-4 sm:gap-6">
            {/* Rank 2 */}
            {entries[1] && <PodiumCard entry={entries[1]} total={total} solo={solo} />}
            {/* Rank 1 */}
            {entries[0] && <PodiumCard entry={entries[0]} total={total} solo={solo} isFirst />}
            {/* Rank 3 */}
            {entries[2] && <PodiumCard entry={entries[2]} total={total} solo={solo} />}
          </div>

          {/* LIST (Ranks 4+) */}
          {entries.length > 3 && (
            <div className="flex flex-col gap-3">
              {entries.slice(3).map((e, i) => (
                <ListCard key={e.did} e={e} index={i} total={total} solo={solo} />
              ))}
            </div>
          )}
        </div>
      )}

      <p className="mt-4 text-center font-[var(--font-mono)] text-[11px] text-[var(--color-text-secondary)]">
        {total
          ? period === "week"
            ? "every play counts · points from the last 7 days"
            : "every play counts · daily, solo and 1v1 added up"
          : solo
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
      className="relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
      style={{
        color: on ? "var(--color-text-primary)" : "var(--color-text-secondary)",
        background: on ? "var(--color-surface)" : "transparent",
        boxShadow: on ? "0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)" : "none",
        border: on ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
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

function PodiumCard({ entry, total, solo, isFirst }: { entry: LeaderboardEntry; total: boolean; solo: boolean; isFirst?: boolean }) {
  const color = rankColor(entry.rank);
  const size = isFirst ? 56 : 44;
  const padding = isFirst ? "p-3 sm:p-6" : "p-2 sm:p-4";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: entry.rank * 0.1 }}
      className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-[24px] border border-white/10 bg-black/40 backdrop-blur-xl ${padding}`}
      style={{
        maxWidth: "240px",
        boxShadow: isFirst ? `0 20px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2), 0 0 40px ${color}22` : "0 10px 20px rgba(0,0,0,0.3)",
      }}
    >
      {isFirst && (
        <div className="pointer-events-none absolute inset-0 rounded-[24px] bg-[var(--color-gold)] opacity-10 blur-xl" />
      )}
      <div className="relative z-10 font-[var(--font-display)] text-lg font-bold sm:text-xl" style={{ color }}>
        #{entry.rank}
      </div>
      <div className="relative z-10 mt-2 sm:mt-3">
        <Link href={`/u/${entry.handle}`}>
          <Avatar id={entry.did} name={entry.display_name ?? entry.handle} avatarUrl={entry.avatar_url} size={size} />
        </Link>
      </div>
      <div className="relative z-10 w-full mt-2 text-center sm:mt-3">
        <Link href={`/u/${entry.handle}`} className="block w-full truncate font-[var(--font-display)] text-sm font-bold text-[var(--color-text-primary)] transition-opacity hover:opacity-80 sm:text-base" style={{ fontSize: isFirst ? "clamp(0.85rem, 3.5vw, 1.25rem)" : "clamp(0.75rem, 3vw, 1rem)" }}>
          {entry.display_name ?? entry.handle}
        </Link>
        <div className="hidden truncate font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)] sm:block">
          @{entry.handle}
        </div>
      </div>
      <div className="relative z-10 mt-2 text-center sm:mt-4">
        <div className="font-[var(--font-display)] text-lg font-bold sm:text-2xl" style={{ color: isFirst ? color : "var(--color-primary)" }}>
          {solo || total ? entry.total_score.toLocaleString() : entry.games_won}
        </div>
        <div className="font-[var(--font-mono)] text-[8px] uppercase tracking-wide text-[var(--color-text-secondary)] sm:text-[10px]">
          {total ? "points" : solo ? "best" : "wins"}
        </div>
      </div>
    </motion.div>
  );
}

function ListCard({ e, index, total, solo }: { e: LeaderboardEntry; index: number; total: boolean; solo: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.4) }}
    >
      <Link
        href={`/u/${e.handle}`}
        className="flex items-center gap-3 rounded-[16px] border border-white/5 bg-black/40 px-3 py-3 backdrop-blur-md transition-colors hover:bg-white/10 active:bg-white/10 sm:px-4"
      >
        <div className="w-7 shrink-0 text-center font-[var(--font-display)] text-lg font-bold" style={{ color: rankColor(e.rank) }}>
          {e.rank}
        </div>
        <Avatar id={e.did} name={e.display_name ?? e.handle} avatarUrl={e.avatar_url} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-[var(--font-display)] font-semibold text-[var(--color-text-primary)]">
            {e.display_name ?? e.handle}
          </div>
          <div className="truncate font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
            @{e.handle}
          </div>
        </div>
        <div className="hidden text-right sm:block">
          {total ? (
            <div className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
              {e.games_played} {e.games_played === 1 ? "play" : "plays"}
              {e.games_won > 0 && ` · ${e.games_won} won`}
            </div>
          ) : solo ? (
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
            {solo || total ? e.total_score.toLocaleString() : e.games_won}
          </div>
          <div className="font-[var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
            {total ? "points" : solo ? "best" : "wins"}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
