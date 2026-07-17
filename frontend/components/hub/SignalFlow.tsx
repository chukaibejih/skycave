"use client";
import { useEffect, useRef, useState } from "react";
import type { GameInfo } from "@/lib/types";

const ACCENT: Record<string, string> = {
  geoguess: "var(--color-primary)",
  color_clash: "var(--color-warm)",
  flag_rush: "var(--color-success)",
  outline_quiz: "var(--color-cyan)",
  word_duel: "var(--color-gold)",
  reaction_grid: "var(--color-primary)",
  mad_math: "var(--color-gold)",
  word_hunt: "var(--color-cyan)",
  tile_takeover: "var(--color-success)",
  connect4: "var(--color-gold)",
  dots_boxes: "var(--color-cyan)",
  clay: "var(--color-warm)",
};
const accentOf = (t: string) => ACCENT[t] ?? "var(--color-primary)";

const SPACING = 165; // px between game nodes along the wire
const SPEED = 30; // px / second the signal flows
const FADE_IN = 60;
const FADE_OUT = 130;

// The signal shape: a smooth two-harmonic wave in [-1, 1]. Both the drawn line
// and the game nodes ride this exact function, so a node always sits on the wire.
const wave = (u: number) =>
  0.62 * Math.sin(u * Math.PI * 2 - 0.4) + 0.38 * Math.sin(u * Math.PI * 4 + 0.8);

/**
 * Signal-flow hub. Game nodes stream along a pulsing wave, looping end to end.
 * Touching the band freezes the flow (freeze-on-touch) so tapping a moving node
 * always lands on a stationary target; releasing on a node launches it.
 */
export function SignalFlow({
  games,
  onPlay,
}: {
  games: GameInfo[];
  onPlay: (g: GameInfo) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const paused = useRef(false); // frozen while a finger is down (freeze-on-touch + scrub)
  const offset = useRef(0);
  const drag = useRef<{ x: number; off: number; lastX: number; lastT: number } | null>(null);
  const vel = useRef(0); // px/sec fling velocity, decays after release
  const moved = useRef(false); // did this gesture scrub? if so, suppress the node tap
  const [dims, setDims] = useState({ w: 0, h: 200 });

  const n = games.length;

  // Measure the band so the wave path + node math use real pixels.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setDims({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Animate the flow. Positions are written straight to the DOM (no React
  // re-render per frame). `paused` gates the advance for freeze-on-touch.
  useEffect(() => {
    if (n === 0) return;
    let raf = 0;
    let last = performance.now();
    const L = n * SPACING;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!paused.current) {
        offset.current += SPEED * dt; // base auto-drift
        if (Math.abs(vel.current) > 2) {
          offset.current += vel.current * dt; // fling momentum from a release
          vel.current *= Math.pow(0.02, dt); // time-based friction
        } else {
          vel.current = 0;
        }
      }
      const el = wrapRef.current;
      if (el) {
        const W = el.clientWidth;
        const H = el.clientHeight;
        const cy = H / 2;
        const amp = H * 0.2;
        for (let i = 0; i < n; i++) {
          const node = nodeRefs.current[i];
          if (!node) continue;
          const x = (((i * SPACING + offset.current) % L) + L) % L;
          const y = cy + amp * wave(x / W);
          node.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
          let op = 1;
          if (x < FADE_IN) op = x / FADE_IN;
          else if (x > W - FADE_OUT) op = Math.max(0, (W - x) / FADE_OUT);
          node.style.opacity = x > W ? "0" : String(op);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [n]);

  // Build the drawn wave path across the measured width.
  const path = (() => {
    const { w, h } = dims;
    if (w === 0) return "";
    const cy = h / 2;
    const amp = h * 0.2;
    const steps = 80;
    let d = "";
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const x = u * w;
      const y = cy + amp * wave(u);
      d += `${s === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    return d;
  })();

  // Grab the wire to scrub it yourself. A tap (no real movement) still freezes
  // and falls through to the node's launch; a drag scrubs and flings on release.
  const onDown = (e: React.PointerEvent) => {
    paused.current = true;
    vel.current = 0;
    moved.current = false;
    drag.current = { x: e.clientX, off: offset.current, lastX: e.clientX, lastT: performance.now() };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 4) moved.current = true;
    offset.current = d.off + dx;
    const now = performance.now();
    const dt = Math.max(0.001, (now - d.lastT) / 1000);
    vel.current = Math.max(-2600, Math.min(2600, (e.clientX - d.lastX) / dt));
    d.lastX = e.clientX;
    d.lastT = now;
  };
  const onUp = () => {
    drag.current = null;
    paused.current = false; // resume auto-drift; any fling decays in the tick
  };

  return (
    <div
      ref={wrapRef}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      onPointerCancel={onUp}
      style={{ touchAction: "pan-y" }}
      className="relative h-[190px] w-full cursor-grab overflow-hidden active:cursor-grabbing sm:h-[220px]"
    >
      {/* The signal line */}
      <svg
        width={dims.w}
        height={dims.h}
        className="pointer-events-none absolute inset-0"
        aria-hidden
      >
        {path && (
          <>
            <path d={path} fill="none" stroke="var(--color-cyan)" strokeOpacity="0.18" strokeWidth="10" strokeLinecap="round" style={{ filter: "blur(6px)" }} />
            <path d={path} fill="none" stroke="var(--color-cyan)" strokeWidth="2" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 6px var(--color-cyan))" }} />
          </>
        )}
      </svg>

      {/* Game nodes riding the signal */}
      {games.map((g, i) => {
        const accent = accentOf(g.type);
        return (
          <button
            key={g.type}
            ref={(el) => {
              nodeRefs.current[i] = el;
            }}
            onClick={() => {
              if (moved.current) return; // this was a scrub, not a tap
              onPlay(g);
            }}
            style={{
              borderColor: `color-mix(in srgb, ${accent} 60%, transparent)`,
              boxShadow: `0 0 18px color-mix(in srgb, ${accent} 30%, transparent), 0 4px 16px rgba(0,0,0,0.45)`,
              willChange: "transform",
            }}
            className="absolute left-0 top-0 flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-full border bg-[var(--color-surface)]/95 px-4 font-[var(--font-mono)] text-[12px] text-[var(--color-text-primary)] backdrop-blur-sm active:bg-[var(--color-elevated)]"
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
            />
            {g.name}
          </button>
        );
      })}

      {n === 0 && (
        <div className="absolute inset-0 grid place-items-center font-[var(--font-mono)] text-xs uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
          syncing signal...
        </div>
      )}
    </div>
  );
}
