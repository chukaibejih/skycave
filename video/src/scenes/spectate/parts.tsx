import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { display, mono } from "../../fonts";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Colors lifted straight from the live app (globals.css) so the film reads as
// the same product, not a lookalike.
export const APP = {
  base: "#05060a",
  surface: "#10131c",
  elevated: "#171b27",
  border: "#283044",
  ink: "#f5f7ff",
  ink2: "#9aa3ba",
  warm: "#ff725e", // coral: LIVE / WATCH / FINAL
  cyan: "#67e8f9",
  gold: "#ffd166",
  violet: "#8b7cff",
  green: "#4ade80",
} as const;

/** Count from 0 to `to` over a window (the watcher count ticking up). */
export function useCountUp(to: number, start: number, dur: number): number {
  const frame = useCurrentFrame();
  return Math.round(interpolate(frame, [start, start + dur], [0, to], clamp));
}

export const EyeIcon: React.FC<{ size?: number; color?: string; stroke?: number }> = ({
  size = 22,
  color = APP.cyan,
  stroke = 2,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

/** A gradient avatar with an optional gold ring (the app's reigning-champ look). */
export const Avatar: React.FC<{ i: number; size?: number; ring?: boolean }> = ({ i, size = 44, ring }) => {
  const h1 = (i * 63) % 360;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flex: "none",
        background: `linear-gradient(135deg, hsl(${h1} 68% 60%), hsl(${(h1 + 40) % 360} 62% 44%))`,
        border: ring ? `2.5px solid ${APP.gold}` : "2px solid rgba(255,255,255,0.12)",
        boxShadow: ring ? `0 0 14px ${APP.gold}66` : "none",
      }}
    />
  );
};

const LivePill: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        top: -14,
        right: 22,
        padding: "5px 14px",
        borderRadius: 999,
        background: APP.warm,
        color: "#150402",
        fontFamily: mono,
        fontWeight: 600,
        fontSize: 20,
        letterSpacing: "0.1em",
        opacity: 0.7 + 0.3 * Math.abs(Math.sin(frame / 9)),
      }}
    >
      LIVE
    </div>
  );
};

type Line = { name: string; tag: "now" | "-" };

/** The app's bracket match card: LIVE pill, two players with a divider, the
 * best-of-three game lines, and the coral WATCH button. `watchTap` (0..1) pulses
 * the button as if tapped. */
export const BracketMatchCard: React.FC<{
  width: number;
  a: { name: string; ring?: boolean };
  b: { name: string; ring?: boolean };
  lines: Line[];
  watchTap?: number;
}> = ({ width, a, b, lines, watchTap = 0 }) => {
  const row = (name: string, i: number, ring?: boolean) => (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <Avatar i={i} size={44} ring={ring} />
      <span style={{ flex: 1, fontFamily: display, fontWeight: 600, fontSize: 30, color: APP.ink, whiteSpace: "nowrap" }}>{name}</span>
    </div>
  );
  return (
    <div
      style={{
        position: "relative",
        width,
        padding: 22,
        borderRadius: 16,
        background: `${APP.surface}f5`,
        border: `1.5px solid ${APP.warm}66`,
        boxShadow: `0 0 34px ${APP.warm}1f`,
      }}
    >
      <LivePill />
      {row(a.name, 3, a.ring)}
      <div style={{ height: 1, background: APP.border, margin: "16px 0" }} />
      {row(b.name, 8, b.ring)}

      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 2 }}>
        {lines.map((l, i) => {
          const now = l.tag === "now";
          return (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "9px 12px",
                borderRadius: 8,
                background: now ? `${APP.cyan}14` : "transparent",
              }}
            >
              <span style={{ fontFamily: mono, fontSize: 22, color: now ? APP.cyan : APP.ink2 }}>{l.name}</span>
              <span style={{ fontFamily: mono, fontSize: 22, color: now ? APP.cyan : APP.ink2 }}>{l.tag}</span>
            </div>
          );
        })}
      </div>

      {/* WATCH button */}
      <div
        style={{
          marginTop: 16,
          height: 56,
          borderRadius: 12,
          border: `1.5px solid ${APP.warm}88`,
          background: `${APP.warm}${watchTap > 0 ? "33" : "14"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          color: APP.warm,
          fontFamily: mono,
          fontSize: 24,
          letterSpacing: "0.12em",
          transform: `scale(${1 - watchTap * 0.04})`,
        }}
      >
        <EyeIcon size={22} color={APP.warm} />
        WATCH
      </div>
    </div>
  );
};

/** The trophy node the bracket ends at (the app's Cup column). */
export const CupNode: React.FC<{ lit?: boolean; label?: string; scale?: number }> = ({ lit, label = "champion", scale = 1 }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, transform: `scale(${scale})` }}>
    <div
      style={{
        width: 96,
        height: 96,
        borderRadius: 48,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: lit ? `${APP.gold}1f` : APP.surface,
        border: `1.5px solid ${lit ? APP.gold + "aa" : APP.border}`,
        boxShadow: lit ? `0 0 30px ${APP.gold}66` : "none",
        opacity: lit ? 1 : 0.55,
      }}
    >
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={lit ? APP.gold : APP.ink2} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
        <path d="M4 22h16" />
        <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
        <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
        <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
      </svg>
    </div>
    <span style={{ fontFamily: mono, fontSize: 15, letterSpacing: "0.14em", textTransform: "uppercase", color: lit ? APP.gold : APP.ink2 }}>{label}</span>
  </div>
);

// A scripted Connect-4 game: columns played in order, alternating violet/gold,
// each disc dropping in on its beat. Deterministic, so it reads as a real game
// unfolding live while you watch.
const MOVES = [3, 3, 2, 3, 4, 2, 4, 1];
const DROP_EVERY = 12;

/** The live Connect-4 board (7x6), discs dropping in over time. */
export const ConnectFour: React.FC<{ width: number; from?: number }> = ({ width, from = 0 }) => {
  const frame = useCurrentFrame() - from;
  const { fps } = useVideoConfig();
  const cols = 7;
  const rows = 6;
  const pad = 16;
  const cell = (width - pad * 2 - (cols - 1) * 8) / cols;
  const board = `${cell * cols + (cols - 1) * 8 + pad * 2}px`;

  // Resolve each move to a resting (col,row) with gravity.
  const heights = Array(cols).fill(0);
  const placed = MOVES.map((c, i) => {
    const restRow = rows - 1 - heights[c];
    heights[c] += 1;
    return { col: c, row: restRow, color: i % 2 === 0 ? APP.violet : APP.gold, at: i * DROP_EVERY };
  });

  return (
    <div style={{ width: board, padding: pad, borderRadius: 20, background: `${APP.surface}`, border: `1px solid ${APP.border}` }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gap: 8 }}>
        {Array.from({ length: cols * rows }, (_, k) => {
          const c = k % cols;
          const r = Math.floor(k / cols);
          const disc = placed.find((p) => p.col === c && p.row === r && frame >= p.at);
          let content: React.ReactNode = null;
          if (disc) {
            const t = spring({ frame: frame - disc.at, fps, config: { damping: 18, stiffness: 220, mass: 0.7 } });
            const fromY = -(disc.row + 1) * (cell + 8);
            content = (
              <div
                style={{
                  width: cell,
                  height: cell,
                  borderRadius: "50%",
                  background: disc.color,
                  transform: `translateY(${interpolate(t, [0, 1], [fromY, 0])}px)`,
                  boxShadow: `0 0 14px ${disc.color}66`,
                }}
              />
            );
          }
          return (
            <div key={k} style={{ width: cell, height: cell, borderRadius: "50%", background: "#0c0e16", overflow: "hidden" }}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const BAR = ["🔥", "👏", "😂", "😮", "🎉", "🐐"];

/** The app's reaction bar; each button pulses on its beat as if tapped. */
export const ReactionBar: React.FC<{ from?: number }> = ({ from = 0 }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: 12,
        borderRadius: 999,
        background: `${APP.surface}e6`,
        border: `1.5px solid ${APP.border}`,
        backdropFilter: "blur(6px)",
      }}
    >
      {BAR.map((e, i) => {
        const beat = from + 10 + i * 8;
        const tap = interpolate(frame, [beat, beat + 5, beat + 12], [1, 1.55, 1], clamp);
        return (
          <div key={e} style={{ width: 66, height: 66, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 38, transform: `scale(${tap})` }}>
            {e}
          </div>
        );
      })}
    </div>
  );
};

/** Emoji reactions rising and fading over the game, spawned over time. */
const EMOJI = ["🔥", "👏", "😮", "🎉", "🐐", "😭", "✨", "💪"];
export const FloatReactions: React.FC<{ rate?: number; from?: number }> = ({ rate = 4, from = 0 }) => {
  const frame = useCurrentFrame() - from;
  const { width } = useVideoConfig();
  if (frame < 0) return null;
  const items: React.ReactNode[] = [];
  for (let s = 0; s <= frame; s += rate) {
    const age = frame - s;
    if (age > 80) continue;
    const idx = Math.floor(s / rate);
    const lane = (idx * 47) % 100;
    const x = width * (0.12 + (lane / 100) * 0.76);
    const drift = Math.sin(age / 12 + idx) * 26;
    const y = interpolate(age, [0, 80], [0, -520], clamp);
    const opacity = interpolate(age, [0, 8, 60, 80], [0, 1, 1, 0], clamp);
    const scale = interpolate(age, [0, 12], [0.5, 1], clamp);
    items.push(
      <div key={s} style={{ position: "absolute", left: x + drift, bottom: 120 - y, fontSize: 60, opacity, transform: `scale(${scale})` }}>
        {EMOJI[idx % EMOJI.length]}
      </div>
    );
  }
  return <>{items}</>;
};

/** The spectator chrome: the Bracket back pill, the WATCHING chip, a clean turn
 * line, and the active player on the right - matching the app's watch header. */
export const WatchChrome: React.FC<{ turnName: string; opacity?: number }> = ({ turnName, opacity = 1 }) => (
  <div style={{ position: "absolute", top: 40, left: 40, right: 40, display: "flex", alignItems: "center", justifyContent: "space-between", opacity }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ padding: "9px 18px", borderRadius: 999, border: `1px solid ${APP.border}`, background: `${APP.surface}cc`, color: APP.ink2, fontFamily: display, fontSize: 22 }}>
        ← Bracket
      </div>
      <div style={{ padding: "9px 18px", borderRadius: 999, border: `1px solid ${APP.warm}88`, background: `${APP.surface}`, color: APP.warm, fontFamily: mono, fontSize: 18, letterSpacing: "0.12em" }}>
        WATCHING
      </div>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontFamily: display, fontWeight: 600, fontSize: 24, color: APP.ink }}>{turnName}</span>
      <Avatar i={8} size={44} />
    </div>
  </div>
);

/** The bottom-left live watcher count, as on the watch screen. */
export const EyeCount: React.FC<{ n: number }> = ({ n }) => (
  <div style={{ position: "absolute", bottom: 44, left: 40, display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", borderRadius: 999, background: `${APP.surface}cc`, border: `1px solid ${APP.border}` }}>
    <EyeIcon size={24} color={APP.cyan} />
    <span style={{ fontFamily: mono, fontSize: 26, color: APP.ink }}>{n.toLocaleString()}</span>
  </div>
);
