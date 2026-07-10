"use client";
import { useEffect, useState } from "react";

// The Cave opens to the public on August 1. Until then the door shows a countdown
// and every /cave route is gated (see app/cave/layout.tsx). The team keeps access
// via CAVE_PREVIEW, which piggybacks on the same local-only dev flag.
export const CAVE_LAUNCH_MS = new Date(2026, 7, 1, 0, 0, 0).getTime(); // Aug 1, 2026 (local)
export const CAVE_LAUNCH_LABEL = "August 1";
export const CAVE_PREVIEW = process.env.NEXT_PUBLIC_DEV_LOGIN === "true";

export interface Countdown {
  mounted: boolean;
  done: boolean;
  days: number;
  hours: number;
  mins: number;
  secs: number;
}

/** Ticking countdown to launch. Client-only (null until mounted) so SSR and the
 * first client render agree. */
export function useCountdown(): Countdown {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const remaining = now === null ? 0 : Math.max(0, CAVE_LAUNCH_MS - now);
  const s = Math.floor(remaining / 1000);
  return {
    mounted: now !== null,
    done: now !== null && now >= CAVE_LAUNCH_MS,
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    mins: Math.floor((s % 3600) / 60),
    secs: s % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** DD : HH : MM : SS readout in the warm Cave palette. */
export function CountdownRow({ c }: { c: Countdown }) {
  const cells: [string, number][] = [
    ["days", c.days],
    ["hrs", c.hours],
    ["min", c.mins],
    ["sec", c.secs],
  ];
  return (
    <div className="flex items-end gap-2 sm:gap-3">
      {cells.map(([label, v], i) => (
        <div key={label} className="flex items-end gap-2 sm:gap-3">
          <div className="text-center">
            <div className="font-[var(--font-display)] text-2xl font-bold tabular-nums sm:text-3xl" style={{ color: "#f5efe2" }}>
              {c.mounted ? pad(v) : "--"}
            </div>
            <div className="font-[var(--font-mono)] text-[9px] uppercase tracking-[0.16em]" style={{ color: "#8a8069" }}>
              {label}
            </div>
          </div>
          {i < cells.length - 1 && (
            <span className="pb-4 text-lg font-bold" style={{ color: "#5c503a" }}>:</span>
          )}
        </div>
      ))}
    </div>
  );
}
