"use client";
import { useEffect, useRef, useState } from "react";

interface Props {
  // Unix seconds when the room closes.
  expiresAt: number;
  // Fired exactly once when the countdown reaches zero.
  onExpire: () => void;
}

const fmt = (secs: number) => {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Quiet "room closes in MM:SS" countdown. Self-contained: it owns its own ticking
 * state and re-renders only itself once a second, never the parent lobby. Calls
 * onExpire once when it hits zero (a fallback for when the ROOM_EXPIRED socket
 * event does not arrive, e.g. after a server restart dropped the timer).
 */
export function RoomCountdown({ expiresAt, onExpire }: Props) {
  const [remaining, setRemaining] = useState(() => expiresAt - Date.now() / 1000);
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
    const tick = () => {
      const left = expiresAt - Date.now() / 1000;
      setRemaining(left);
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpire();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, onExpire]);

  if (remaining <= 0) return null;

  // Quiet pill for the top bar: a clock glyph + MM:SS. Under a minute it warms
  // up so the closing room reads as mildly urgent without being alarming.
  const urgent = remaining <= 60;
  return (
    <span
      title="time left before this room closes"
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-[var(--font-mono)] text-xs tabular-nums"
      style={{
        borderColor: urgent ? "var(--color-warm)" : "var(--color-border)",
        color: urgent ? "var(--color-warm)" : "var(--color-text-secondary)",
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      {fmt(remaining)}
    </span>
  );
}
