"use client";
import { useEffect, useState } from "react";

interface Props {
  /** Client-anchored deadline in epoch seconds (see store ROUND_START). */
  endsAt: number | null;
  /** The round's full duration in seconds, for the ring fraction. */
  durationSec: number;
  active: boolean;
  size?: number;
}

// Compact countdown ring shown in the score header. Counts down to `endsAt`
// (anchored to the client clock at ROUND_START, so it's immune to client/server
// clock skew during normal play). Turns coral in the final seconds.
export function RoundTimer({ endsAt, durationSec, active, size = 44 }: Props) {
  const [now, setNow] = useState(() => Date.now() / 1000);

  useEffect(() => {
    if (!active || !endsAt) return;
    const id = setInterval(() => setNow(Date.now() / 1000), 200);
    return () => clearInterval(id);
  }, [active, endsAt]);

  if (!active || !endsAt) {
    // Placeholder keeps the header layout from jumping between phases.
    return <div style={{ width: size, height: size }} />;
  }

  const remaining = Math.max(0, endsAt - now);
  const secs = Math.ceil(remaining);
  const frac = durationSec > 0 ? Math.max(0, Math.min(1, remaining / durationSec)) : 0;
  const urgent = remaining <= 3;
  const color = urgent ? "var(--color-warm)" : "var(--color-primary)";

  const r = 18;
  const circ = 2 * Math.PI * r;

  return (
    <div className="relative" style={{ width: size, height: size }} aria-label={`${secs}s left`}>
      <svg width={size} height={size} viewBox="0 0 44 44" className="-rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="var(--color-border)" strokeWidth="3" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
          style={{ transition: "stroke-dashoffset 0.2s linear, stroke 0.3s" }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-[var(--font-display)] text-sm font-bold tabular-nums"
        style={{ color }}
      >
        {secs}
      </span>
    </div>
  );
}
