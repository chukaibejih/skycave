"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/**
 * A live countdown to an instant.
 *
 * The deadline arrives from the server as a UTC instant, so there is no
 * timezone maths to get wrong here: Date parses it and the difference is
 * absolute. Daylight saving is handled where the instant is chosen (the server
 * anchors it to America/Los_Angeles), which is the only place it can be handled
 * correctly. The label below the clock states the local wall time so a player
 * can sanity check it against their own clock.
 */
export function Countdown({
  to,
  onElapsed,
  compact = false,
}: {
  to: string;
  onElapsed?: () => void;
  compact?: boolean;
}) {
  const target = new Date(to).getTime();
  const [left, setLeft] = useState(() => Math.max(0, target - Date.now()));

  useEffect(() => {
    setLeft(Math.max(0, target - Date.now()));
    const id = setInterval(() => {
      const ms = Math.max(0, target - Date.now());
      setLeft(ms);
      if (ms === 0) onElapsed?.();
    }, 1000);
    return () => clearInterval(id);
    // onElapsed is intentionally not a dep: a fresh closure each render would
    // otherwise restart the interval every second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const s = Math.floor(left / 1000);
  const parts = [
    { v: Math.floor(s / 86400), label: "days" },
    { v: Math.floor((s % 86400) / 3600), label: "hrs" },
    { v: Math.floor((s % 3600) / 60), label: "min" },
    { v: s % 60, label: "sec" },
  ];

  if (compact) {
    const shown = parts.filter((p, i) => p.v > 0 || i >= 2);
    return (
      <span className="font-[var(--font-mono)] tabular-nums">
        {shown.map((p) => `${p.v}${p.label[0]}`).join(" ")}
      </span>
    );
  }

  return (
    <div className="flex items-start justify-center gap-2 sm:gap-3">
      {parts.map((p, i) => (
        <div key={p.label} className="flex items-start gap-2 sm:gap-3">
          <div className="flex flex-col items-center">
            <motion.div
              // A gentle breath so the clock reads as alive, not a static image.
              animate={{ scale: [1, 1.03, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.12 }}
              className="grid min-w-[62px] place-items-center rounded-[14px] border px-2 py-2.5 sm:min-w-[74px]"
              style={{
                borderColor: "color-mix(in srgb, var(--color-primary) 30%, transparent)",
                background: "color-mix(in srgb, var(--color-elevated) 85%, transparent)",
              }}
            >
              <span className="font-[var(--font-display)] text-3xl font-bold tabular-nums leading-none sm:text-4xl">
                {String(p.v).padStart(2, "0")}
              </span>
            </motion.div>
            <span className="mt-1.5 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
              {p.label}
            </span>
          </div>
          {i < parts.length - 1 && (
            <span className="pt-2 font-[var(--font-display)] text-2xl text-[var(--color-text-secondary)] sm:text-3xl">
              :
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** The deadline in the reader's own timezone, so they can trust the clock. */
export function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState("");
  useEffect(() => {
    // Formatted after mount: the server and the browser are in different
    // timezones, and formatting during render would mismatch on hydration.
    setText(
      new Date(iso).toLocaleString(undefined, {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })
    );
  }, [iso]);
  return <>{text}</>;
}

/**
 * A stadium scoreboard, not a website widget. Big tabular numerals in slabs, a
 * driving colon, and a colour that carries the state of the event. This is the
 * "how much time do I have" answer, made impossible to miss.
 *
 * Days drop off once the event is inside a day, so the closing hours read as
 * hours:minutes:seconds rather than a lonely "0" days slab.
 */
export function Scoreboard({ to, accent = "var(--color-primary)" }: { to: string; accent?: string }) {
  const target = new Date(to).getTime();
  const [left, setLeft] = useState(() => Math.max(0, target - Date.now()));

  useEffect(() => {
    setLeft(Math.max(0, target - Date.now()));
    const id = setInterval(() => setLeft(Math.max(0, target - Date.now())), 1000);
    return () => clearInterval(id);
  }, [target]);

  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  const all = [
    { v: d, label: "days" },
    { v: Math.floor((s % 86400) / 3600), label: "hrs" },
    { v: Math.floor((s % 3600) / 60), label: "min" },
    { v: s % 60, label: "sec" },
  ];
  const parts = d > 0 ? all : all.slice(1);

  return (
    <div className="flex items-start justify-center gap-1.5 sm:gap-2">
      {parts.map((p, i) => (
        <div key={p.label} className="flex items-start gap-1.5 sm:gap-2">
          <div className="flex flex-col items-center">
            <div
              className="grid min-w-[58px] place-items-center rounded-[14px] border px-1 py-2 sm:min-w-[68px]"
              style={{
                borderColor: `color-mix(in srgb, ${accent} 35%, transparent)`,
                background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 14%, var(--color-elevated)), var(--color-surface))`,
                boxShadow: `0 0 24px color-mix(in srgb, ${accent} 18%, transparent)`,
              }}
            >
              <span
                className="font-[var(--font-display)] text-4xl font-bold tabular-nums leading-none sm:text-5xl"
                style={{ color: "var(--color-text-primary)" }}
              >
                {String(p.v).padStart(2, "0")}
              </span>
            </div>
            <span
              className="mt-1.5 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.18em]"
              style={{ color: `color-mix(in srgb, ${accent} 70%, var(--color-text-secondary))` }}
            >
              {p.label}
            </span>
          </div>
          {i < parts.length - 1 && (
            <span
              className="pt-1.5 font-[var(--font-display)] text-3xl font-bold sm:text-4xl"
              style={{ color: `color-mix(in srgb, ${accent} 60%, transparent)` }}
            >
              :
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
