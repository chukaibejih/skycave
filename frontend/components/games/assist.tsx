"use client";
import { useEffect, useState } from "react";

// Shared "Assist" preference across games. Off by default; remembered locally.
export function useAssist(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(typeof window !== "undefined" && localStorage.getItem("skycave_assist") === "1");
  }, []);
  const set = (v: boolean) => {
    setOn(v);
    try {
      localStorage.setItem("skycave_assist", v ? "1" : "0");
    } catch {
      /* private mode; fine */
    }
  };
  return [on, set];
}

// Show a hint only after a short idle pause, so it nudges rather than nags. The
// timer resets whenever `resetKey` changes (e.g. a move was made / the turn flipped).
export function useIdleHint(enabled: boolean, resetKey: unknown, delay = 2000): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(false);
    if (!enabled) return;
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [enabled, resetKey, delay]);
  return show;
}

export function AssistToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium"
      style={{
        borderColor: on ? "var(--color-primary)" : "var(--color-border)",
        color: on ? "var(--color-text-primary)" : "var(--color-text-secondary)",
        background: on ? "color-mix(in srgb, var(--color-primary) 14%, transparent)" : "transparent",
      }}
    >
      Assist
      <span className="flex h-4 w-7 items-center rounded-full p-0.5" style={{ background: on ? "var(--color-primary)" : "var(--color-border)" }}>
        <span className="h-3 w-3 rounded-full bg-white transition-transform" style={{ transform: on ? "translateX(12px)" : "translateX(0)" }} />
      </span>
    </button>
  );
}
