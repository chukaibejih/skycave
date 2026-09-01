"use client";
import { useEffect, useState } from "react";
import type { BoardState } from "@/lib/types";

/**
 * The move clock (Rule 1). A small pill at the top showing whose turn it is and
 * how long they have left before they forfeit the game. Only appears when the
 * server sent a `turn_ends_at` (1v1 turn games); solo and casual-no-clock games
 * pass null, so it stays hidden. The last 10 seconds go urgent (coral + pulse).
 */
export function TurnClock({
  board,
  meId,
  players,
}: {
  board: BoardState | null;
  meId: string | undefined;
  players: { id: string; display_name: string }[];
}) {
  const endsAt = board?.turn_ends_at ?? null;
  const turn = board?.turn ?? null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [endsAt]);

  if (!endsAt || !turn) return null;

  const left = Math.max(0, Math.ceil(endsAt - now / 1000));
  const mine = turn === meId;
  const oppName = players.find((p) => p.id === turn)?.display_name ?? "Opponent";
  const urgent = left <= 10;
  const mm = Math.floor(left / 60);
  const ss = (left % 60).toString().padStart(2, "0");

  const color = urgent ? "var(--color-warm)" : mine ? "var(--color-cyan)" : "var(--color-text-secondary)";
  return (
    <div className="pointer-events-none fixed left-1/2 top-3 z-40 -translate-x-1/2">
      <div
        className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold backdrop-blur-sm ${urgent ? "animate-pulse" : ""}`}
        style={{
          borderColor: urgent
            ? "var(--color-warm)"
            : mine
              ? "color-mix(in srgb, var(--color-cyan) 55%, transparent)"
              : "var(--color-border)",
          background: urgent
            ? "color-mix(in srgb, var(--color-warm) 16%, var(--color-surface))"
            : "color-mix(in srgb, var(--color-surface) 92%, transparent)",
          color,
        }}
      >
        <span>{mine ? "Your move" : `${oppName}'s move`}</span>
        <span className="tabular-nums" style={{ color: urgent ? "var(--color-warm)" : "var(--color-text-primary)" }}>
          {mm}:{ss}
        </span>
      </div>
    </div>
  );
}
