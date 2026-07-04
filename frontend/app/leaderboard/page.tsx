"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Avatar } from "@/components/ui/Avatar";
import {
  getLeaderboard,
  type LeaderboardEntry,
  type LeaderboardPeriod,
} from "@/lib/api";

const bskyProfile = (handle: string) => `https://bsky.app/profile/${handle}`;

const TABS: { key: LeaderboardPeriod; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "all", label: "All time" },
];

export default function LeaderboardPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<LeaderboardPeriod>("week");
  // Cache each period so toggling back and forth doesn't refetch/flicker.
  const [cache, setCache] = useState<
    Partial<Record<LeaderboardPeriod, LeaderboardEntry[]>>
  >({});
  const entries = cache[period] ?? null;

  useEffect(() => {
    if (cache[period]) return; // already loaded this period
    let active = true;
    getLeaderboard(period, 25)
      .then((r) => {
        if (active) setCache((c) => ({ ...c, [period]: r.entries }));
      })
      .catch(() => {
        if (active) setCache((c) => ({ ...c, [period]: [] }));
      });
    return () => {
      active = false;
    };
  }, [period, cache]);

  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-6 flex items-center justify-between">
        <button
          onClick={() => router.push("/")}
          aria-label="Back"
          className="grid h-12 w-12 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/70 text-[var(--color-text-secondary)] active:text-[var(--color-text-primary)]"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
        </button>
        <div className="text-center">
          <div className="font-[var(--font-display)] text-2xl font-bold">
            Leader<span className="text-[var(--color-primary)]">board</span>
          </div>
          <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
            top players by score
          </div>
        </div>
        <div className="w-12" />
      </header>

      {/* Period tabs */}
      <div className="mb-5 flex justify-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setPeriod(t.key)}
            className="rounded-full border px-4 py-2 text-sm transition-colors"
            style={{
              borderColor: period === t.key ? "var(--color-primary)" : "var(--color-border)",
              color: period === t.key ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              background: period === t.key ? "color-mix(in srgb, var(--color-primary) 16%, transparent)" : "transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {entries === null ? (
        <p className="py-16 text-center text-sm text-[var(--color-text-secondary)]">
          loading…
        </p>
      ) : entries.length === 0 ? (
        <div className="rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-16 text-center">
          <div className="font-[var(--font-display)] text-xl font-semibold">
            {period === "week" ? "No games yet this week." : "No one on the board yet."}
          </div>
          <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--color-text-secondary)]">
            Log in with Bluesky and play a game to claim the top spot. Guests
            aren&apos;t ranked.
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
            <motion.a
              key={e.did}
              href={bskyProfile(e.handle)}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.4) }}
              className="flex items-center gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 transition-colors first:border-t-0 hover:bg-[var(--color-elevated)] active:bg-[var(--color-elevated)] sm:px-4"
            >
              <div
                className="w-7 shrink-0 text-center font-[var(--font-display)] text-lg font-bold"
                style={{ color: rankColor(e.rank) }}
              >
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
              {/* Stats: score always; played/won on wider screens */}
              <div className="hidden text-right sm:block">
                <div className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
                  {e.games_played} played · {e.games_won} won
                </div>
                <div className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
                  {Math.round(e.win_rate * 100)}% win
                </div>
              </div>
              <div className="w-16 shrink-0 text-right sm:w-20">
                <div className="font-[var(--font-display)] text-lg font-bold text-[var(--color-primary)]">
                  {e.total_score.toLocaleString()}
                </div>
                <div className="font-[var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
                  score
                </div>
              </div>
              <span aria-hidden className="hidden text-[var(--color-text-secondary)] sm:inline">
                ↗
              </span>
            </motion.a>
          ))}
        </div>
      )}

      <p className="mt-4 text-center font-[var(--font-mono)] text-[11px] text-[var(--color-text-secondary)]">
        {period === "week"
          ? "1v1 score from the last 7 days"
          : "ranked by cumulative 1v1 score"}
      </p>
    </main>
  );
}

// Gold / silver / bronze for the podium, muted otherwise.
function rankColor(rank: number): string {
  if (rank === 1) return "var(--color-gold)";
  if (rank === 2) return "#cbd5e1";
  if (rank === 3) return "#e0a678";
  return "var(--color-text-secondary)";
}
