"use client";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { getLeaderboard, type LeaderboardEntry } from "@/lib/api";

function rankColor(rank: number): string {
  if (rank === 1) return "var(--color-gold)";
  if (rank === 2) return "#cbd5e1";
  if (rank === 3) return "#e0a678";
  return "var(--color-text-secondary)";
}

/**
 * A game's solo leaderboard, shown under a solo result (a player asked for it).
 * Its own fetch so it never blocks the result; a scrollable list that
 * highlights the viewer's row. Hidden entirely when the board is empty.
 */
export function SoloLeaderboard({
  gameType,
  gameName,
  meId,
}: {
  gameType: string;
  gameName: string;
  meId: string | null | undefined;
}) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [unit, setUnit] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getLeaderboard({ game: gameType, mode: "solo", limit: 50 })
      .then((r) => {
        if (!alive) return;
        setEntries(r.entries);
        setUnit(r.score_unit);
      })
      .catch(() => alive && setEntries([]));
    return () => {
      alive = false;
    };
  }, [gameType]);

  if (entries === null) {
    return (
      <p className="mx-auto mt-14 max-w-md text-center font-[var(--font-body)] text-sm text-[var(--color-text-secondary)]">
        Loading the leaderboard...
      </p>
    );
  }
  if (entries.length === 0) return null;

  const myRank = meId ? entries.find((e) => e.did === meId)?.rank ?? null : null;

  return (
    <section className="mx-auto mt-14 w-full max-w-md">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-[var(--font-display)] text-xl font-bold text-[var(--color-text-primary)]">
          {gameName} leaderboard
        </h2>
        <span className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
          {myRank ? `you're #${myRank}` : unit ?? "top runs"}
        </span>
      </div>
      <div
        className="max-h-[420px] overflow-y-auto rounded-[16px] border"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        {entries.map((e) => {
          const isMe = !!meId && e.did === meId;
          return (
            <div
              key={e.did}
              className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
              style={{
                borderColor: "var(--color-border)",
                background: isMe ? "color-mix(in srgb, var(--color-primary) 14%, transparent)" : "transparent",
              }}
            >
              <span
                className="w-6 shrink-0 text-center font-[var(--font-display)] text-sm font-bold tabular-nums"
                style={{ color: rankColor(e.rank) }}
              >
                {e.rank}
              </span>
              <Avatar id={e.did} name={e.display_name ?? e.handle} avatarUrl={e.avatar_url} size={30} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                  {isMe ? "You" : e.display_name ?? e.handle}
                </div>
                {e.handle && e.handle !== "guest" && (
                  <div className="truncate font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)]">
                    @{e.handle}
                  </div>
                )}
              </div>
              <span className="shrink-0 font-[var(--font-display)] text-sm font-bold tabular-nums text-[var(--color-text-primary)]">
                {e.total_score.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
