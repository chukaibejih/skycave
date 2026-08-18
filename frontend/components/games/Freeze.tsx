"use client";
import { useEffect, useRef, useState } from "react";
import type { RoundResult } from "@/lib/store";
import type { PlayerSlot } from "@/lib/types";

/**
 * Freeze - stop the marker as close to the target as you can.
 *
 * The marker's motion is a pure, deterministic function of the round's `seed`
 * (so both players see the identical pattern; they need not be wall-clock
 * synced, since each is judged on their own freeze vs the same target). One
 * input: tap anywhere to FREEZE. Solo = a 60s sprint; 1v1 = commit then reveal,
 * closest wins the round. The marker is animated on a ref (no per-frame React
 * re-render); only the frozen position + the reveal are state.
 */

interface RoundData {
  prompt: string;
  seed: number;
  pattern: string;
  speed: number;
  target: number;
  target_w: number;
  round_time: number;
}

interface Freeze1 {
  pos: number | null;
  pct: number;
  px: number | null;
  points: number;
}

interface Props {
  roundData: RoundData;
  phase: string;
  result: RoundResult | null;
  onAction: (data: Record<string, unknown>) => void;
  submitted?: boolean;
  players?: PlayerSlot[];
  meId?: string;
  solo?: boolean;
}

const P_COLOR = ["#8b7cff", "#ff6b6b"];
const TARGET_COLOR = "#56f0aa";
// Mirror the server's scoring so the freeze flash is instant (server is
// authoritative on the recorded score; these are display only).
const SCALE = 0.5;
const NOMINAL_PX = 1000;
const FLOOR = 85; // solo accuracy points ramp from FLOOR% (=0) to dead-on (=100)
const pctOf = (offset: number) => Math.max(0, Math.round(100 * (1 - Math.min(offset, SCALE) / SCALE)));
const pxOf = (offset: number) => Math.round(offset * NOMINAL_PX);
const ptsOf = (offset: number) => Math.max(0, Math.round(((pctOf(offset) - FLOOR) / (100 - FLOOR)) * 100));

// --- deterministic motion -------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Triangle wave, period 2: 0 -> 1 -> 0. The spine of every pattern.
const tri = (x: number) => {
  const m = ((x % 2) + 2) % 2;
  return m < 1 ? m : 2 - m;
};
const smooth = (x: number) => x * x * (3 - 2 * x);
const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);

/** Marker position in [0,1] at local time `t` (seconds) for a seeded pattern. */
function motion(pattern: string, t: number, seed: number, speed: number): number {
  const phase0 = mulberry32(seed)() * 2; // seeded start point, identical for both players
  const raw = tri(phase0 + t * speed); // linear there-and-back in [0,1]
  switch (pattern) {
    case "accel":
      return smooth(raw); // eases at the turnarounds - slow at the ends, fast through the middle
    case "bounce":
      return smoother(raw); // hangs longer at the ends, like a ball
    case "reverse":
      // A wobble on top of the sweep so it doubles back and fakes you out.
      return tri(phase0 + t * speed + 0.4 * Math.sin(t * (2 + speed * 2)));
    default: // "sweep" | "fast"
      return raw;
  }
}

export function Freeze({
  roundData,
  phase,
  result,
  onAction,
  submitted: submittedFromServer,
  players = [],
  meId,
  solo,
}: Props) {
  const active = phase === "active";
  const markerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const trackWRef = useRef(1);
  const posRef = useRef(0);
  const startRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const [frozenPos, setFrozenPos] = useState<number | null>(null);
  const [submittedLocal, setSubmittedLocal] = useState(false);
  // A quick self-flash after a solo freeze ("97% · 3 px"), computed client-side.
  const [flash, setFlash] = useState<{ pct: number; px: number; pts: number } | null>(null);
  const submitted = submittedLocal || !!submittedFromServer;

  // Marker position in px along the track (transform, not `left`, so it stays on
  // the GPU compositor and never triggers a layout reflow - that was the jitter).
  const place = (p: number) => `translate(${p * trackWRef.current - 3}px, -50%)`;

  // Measure the track width once mounted + on resize, so `place` maps 0..1 -> px.
  useEffect(() => {
    const measure = () => {
      if (trackRef.current) trackWRef.current = trackRef.current.clientWidth || 1;
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (trackRef.current) ro.observe(trackRef.current);
    return () => ro.disconnect();
  }, []);

  // New round: reset and (re)start the animation loop.
  useEffect(() => {
    setFrozenPos(null);
    setSubmittedLocal(false);
    startRef.current = performance.now();
    // Seat the marker at the start position immediately (no stale-frame flash).
    posRef.current = motion(roundData.pattern, 0, roundData.seed, roundData.speed);
    if (markerRef.current) markerRef.current.style.transform = place(posRef.current);
    const step = (now: number) => {
      const t = (now - startRef.current) / 1000;
      const p = motion(roundData.pattern, t, roundData.seed, roundData.speed);
      posRef.current = p;
      if (markerRef.current) markerRef.current.style.transform = place(p);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundData.prompt]);

  const freeze = () => {
    if (!active || submitted || frozenPos !== null) return;
    const p = posRef.current;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    // Leave the marker exactly where it stopped (transform already there).
    setFrozenPos(p);
    setSubmittedLocal(true);
    onAction({ pos: p });
    if (solo) {
      const off = Math.abs(p - roundData.target);
      setFlash({ pct: pctOf(off), px: pxOf(off), pts: ptsOf(off) });
      window.setTimeout(() => setFlash(null), 650);
    }
  };

  const answer = result?.answer as { target?: number; freezes?: Record<string, Freeze1> } | undefined;
  const freezes = answer?.freezes ?? {};
  const target = active ? roundData.target : answer?.target ?? roundData.target;
  const targetW = roundData.target_w ?? 0.04;
  const colorFor = (pid: string) => P_COLOR[players.findIndex((p) => p.id === pid)] ?? "#9aa3ba";

  const live = active && frozenPos === null; // marker is moving

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* Whole play area is the freeze button while it's live. Fixed vertical
          slots + flex spacers keep the layout from shifting when the FREEZE
          label / wait text swap in and out. */}
      <button
        type="button"
        onPointerDown={freeze}
        disabled={!live}
        aria-label="Freeze"
        className="relative flex flex-1 flex-col items-center px-5 disabled:cursor-default"
      >
        <div className="flex-1" />

        {/* Prompt line (fixed height) */}
        <div className="pointer-events-none flex h-5 items-center font-[var(--font-mono)] text-[11px] uppercase tracking-[0.22em] text-[var(--color-text-secondary)]">
          {active ? (submitted ? (solo ? "next…" : "locked in") : "freeze on the target") : "the freeze"}
        </div>

        {/* The track */}
        <div ref={trackRef} className="pointer-events-none relative mt-7 h-24 w-full max-w-xl">
          <Track target={target} targetW={targetW} />

          {/* The live/frozen marker (transform-driven; ref-managed while live). */}
          {active && (
            <div
              ref={markerRef}
              className="absolute left-0 top-1/2 z-20"
              style={{ willChange: "transform", transform: place(frozenPos ?? posRef.current) }}
            >
              <Marker color={frozenPos != null ? colorFor(meId ?? "") : "#f5f7ff"} live={live} />
            </div>
          )}

          {/* Reveal: a dotted "how far off" line from each freeze to the target,
              then the marker on top. The two lines sit just above/below centre so
              they never overlap; the shorter one is the closer freeze. */}
          {!active &&
            Object.entries(freezes).map(([pid, f]) => {
              if (f.pos == null) return null;
              const i = players.findIndex((p) => p.id === pid);
              const w = trackWRef.current;
              const from = Math.min(f.pos, target) * w;
              const width = Math.abs(f.pos - target) * w;
              const c = colorFor(pid);
              return (
                <div key={`gap-${pid}`}>
                  <div
                    aria-hidden
                    className="absolute z-0"
                    style={{
                      top: `calc(50% + ${i === 0 ? -9 : 9}px)`,
                      left: `${from}px`,
                      width: `${width}px`,
                      borderTop: `2px dotted ${c}`,
                      opacity: 0.75,
                    }}
                  />
                  {f.px != null && width > 22 && (
                    <div
                      aria-hidden
                      className="absolute z-0 -translate-x-1/2 font-[var(--font-mono)] text-[9px] tabular-nums"
                      style={{ top: `calc(50% + ${i === 0 ? -22 : 16}px)`, left: `${from + width / 2}px`, color: c }}
                    >
                      {f.px}px
                    </div>
                  )}
                </div>
              );
            })}
          {!active &&
            Object.entries(freezes).map(([pid, f]) =>
              f.pos == null ? null : (
                <div
                  key={pid}
                  className="absolute left-0 top-1/2 z-10"
                  style={{ transform: `translate(${f.pos * trackWRef.current - 3}px, -50%)` }}
                >
                  <Marker color={colorFor(pid)} live={false} dim={pid !== meId && !solo} />
                </div>
              )
            )}
        </div>

        {/* Action slot: FIXED height so swapping FREEZE / wait / empty never
            reflows the screen. */}
        <div className="pointer-events-none mt-8 flex h-12 items-center justify-center">
          {live ? (
            <span className="font-[var(--font-display)] text-4xl font-black tracking-tight text-[var(--color-text-primary)]">
              FREEZE
            </span>
          ) : active && submitted && !solo ? (
            <span className="font-[var(--font-mono)] text-xs uppercase tracking-widest text-[var(--color-text-secondary)]">
              waiting for opponent…
            </span>
          ) : null}
        </div>

        <div className="flex-1" />

        {/* Solo self-flash (absolute - never affects layout): the points earned,
            with the closeness underneath. */}
        {flash && (
          <div className="pointer-events-none absolute inset-x-0 bottom-20 text-center">
            <div
              className="font-[var(--font-display)] text-3xl font-black"
              style={{ color: flash.pts > 0 ? TARGET_COLOR : "var(--color-text-secondary)" }}
            >
              {flash.pts > 0 ? `+${flash.pts}` : "miss"}
            </div>
            <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-widest text-[var(--color-text-secondary)]">
              {flash.pct}% · {flash.px === 0 ? "dead on" : `${flash.px} px`}
            </div>
          </div>
        )}
      </button>

      {/* 1v1 round reveal panel */}
      {!active && !solo && (
        <div className="relative z-10 px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
          <div className="mx-auto w-full max-w-md">
            <RevealPanel freezes={freezes} players={players} meId={meId} colorFor={colorFor} />
          </div>
        </div>
      )}
    </div>
  );
}

function Track({ target, targetW }: { target: number; targetW: number }) {
  return (
    <>
      {/* The rail */}
      <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-white/10" />
      {/* Target zone */}
      <div
        className="absolute top-1/2 h-10 -translate-y-1/2 rounded-md"
        style={{
          left: `${(target - targetW) * 100}%`,
          width: `${targetW * 2 * 100}%`,
          background: `color-mix(in srgb, ${TARGET_COLOR} 22%, transparent)`,
          border: `1px solid color-mix(in srgb, ${TARGET_COLOR} 60%, transparent)`,
          boxShadow: `0 0 18px color-mix(in srgb, ${TARGET_COLOR} 30%, transparent)`,
        }}
      />
      {/* Target centre line */}
      <div
        className="absolute top-1/2 h-12 w-0.5 -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${target * 100}%`, background: TARGET_COLOR }}
      />
    </>
  );
}

function Marker({ color, live, dim }: { color: string; live: boolean; dim?: boolean }) {
  return (
    <div
      className="h-14 w-1.5 rounded-full"
      style={{
        background: color,
        opacity: dim ? 0.55 : 1,
        boxShadow: live ? `0 0 16px ${color}` : `0 0 10px ${color}`,
        transition: live ? "none" : "opacity 0.2s",
      }}
    />
  );
}

function RevealPanel({
  freezes,
  players,
  meId,
  colorFor,
}: {
  freezes: Record<string, Freeze1>;
  players: PlayerSlot[];
  meId?: string;
  colorFor: (pid: string) => string;
}) {
  const rows = players.map((p) => ({ player: p, f: freezes[p.id] })).filter((r) => r.f);
  const winner = rows.find((r) => (r.f!.points ?? 0) > 0)?.player;
  const iWon = !!winner && winner.id === meId;
  const verdict = winner
    ? iWon
      ? "You take the round"
      : `${winner.display_name} takes it`
    : "Dead heat";
  return (
    <div
      className="rounded-[var(--radius-card)] border bg-[var(--color-surface)]/95 p-4 backdrop-blur-md"
      style={{
        borderColor: iWon
          ? "color-mix(in srgb, var(--color-success) 50%, transparent)"
          : "var(--color-border)",
        boxShadow: iWon ? "0 0 26px color-mix(in srgb, var(--color-success) 16%, transparent)" : "none",
      }}
    >
      <div
        className="mb-3 text-center font-[var(--font-display)] text-lg font-black tracking-tight"
        style={{ color: iWon ? "var(--color-success)" : "var(--color-text-primary)" }}
      >
        {verdict}
      </div>
      <div className="space-y-2.5">
        {rows.map(({ player, f }) => {
          const won = (f!.points ?? 0) > 0;
          return (
            <div key={player.id} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 truncate text-sm font-semibold text-[var(--color-text-primary)]">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: colorFor(player.id) }} />
                {player.id === meId ? "You" : player.display_name}
                {won && <span style={{ color: "var(--color-success)" }}>★</span>}
              </span>
              <span className="flex shrink-0 items-baseline gap-3">
                <span className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
                  {f!.pos == null ? "no freeze" : `${f!.px} px`}
                </span>
                <span
                  className="font-[var(--font-display)] text-3xl font-black leading-none tabular-nums"
                  style={{ color: won ? "var(--color-success)" : "var(--color-text-primary)" }}
                >
                  {f!.pct}
                  <span className="text-lg font-bold">%</span>
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
