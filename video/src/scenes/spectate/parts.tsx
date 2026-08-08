import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../../theme";
import { display, mono } from "../../fonts";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** The app's eye glyph (Watch / spectator count). */
export const EyeGlyph: React.FC<{ size?: number; color?: string; stroke?: number }> = ({
  size = 40,
  color = C.cyan,
  stroke = 2,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

/** A deterministic gradient face-dot, so a crowd of viewers reads as people
 * without any real avatars. Hue derived from the index. */
export const FaceDot: React.FC<{ i: number; size?: number; ring?: boolean }> = ({ i, size = 40, ring }) => {
  const h1 = (i * 47) % 360;
  const h2 = (h1 + 40) % 360;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `linear-gradient(135deg, hsl(${h1} 70% 62%), hsl(${h2} 65% 46%))`,
        border: ring ? `2px solid ${C.cyan}` : "2px solid rgba(255,255,255,0.14)",
        flex: "none",
      }}
    />
  );
};

/** Count from 0 to `to` over a window, rounded. For the ticking watcher count. */
export function useCountUp(to: number, start: number, dur: number): number {
  const frame = useCurrentFrame();
  return Math.round(interpolate(frame, [start, start + dur], [0, to], clamp));
}

/** The watch badge: eye + live count, as it sits on the game. */
export const WatchBadge: React.FC<{ count: number; scale?: number; big?: boolean }> = ({ count, scale = 1, big }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: big ? 14 : 10,
      padding: big ? "14px 26px" : "8px 16px",
      borderRadius: 999,
      background: `${C.cyan}14`,
      border: `1.5px solid ${C.cyan}66`,
      transform: `scale(${scale})`,
    }}
  >
    <EyeGlyph size={big ? 40 : 26} color={C.cyan} stroke={2.2} />
    <span style={{ fontFamily: mono, fontWeight: 500, fontSize: big ? 52 : 30, color: C.ink, fontVariantNumeric: "tabular-nums" }}>
      {count.toLocaleString()}
    </span>
  </div>
);

/** A live tile-takeover-ish grid whose cells flood one colour over time, so a
 * spectator scene visibly shows a game *in progress*, not a static mock. */
export const LiveBoard: React.FC<{ size?: number; from?: number }> = ({ size = 300, from = 0 }) => {
  const frame = useCurrentFrame() - from;
  const N = 5;
  const cell = (size - (N - 1) * 6) / N;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${N}, ${cell}px)`, gap: 6 }}>
      {Array.from({ length: N * N }, (_, k) => {
        const r = Math.floor(k / N);
        const c = k % N;
        // A diagonal flood: cells claim in as the "wave" passes, alternating owner.
        const wave = frame / 3.2;
        const claimed = r + c < wave;
        const owner = (r + c) % 2 === 0; // violet vs warm
        const t = spring({ frame: frame - (r + c) * 3.2, fps: 30, config: { damping: 16, stiffness: 160 } });
        const on = claimed ? t : 0;
        const col = owner ? C.violet : C.warm;
        return (
          <div
            key={k}
            style={{
              width: cell,
              height: cell,
              borderRadius: 8,
              background: `color-mix(in srgb, ${col} ${Math.round(on * 82)}%, ${C.surface})`,
              border: `1px solid ${on > 0.2 ? `${col}aa` : C.border}`,
              transform: `scale(${0.9 + on * 0.1})`,
            }}
          />
        );
      })}
    </div>
  );
};

/** The live match card, mirroring the app's bracket card: two players with
 * scores, a LIVE pill, and (optionally) the watch badge + a live board. Kept
 * visual and light on text - the motion inside carries the message. */
export const MatchCard: React.FC<{
  width: number;
  s1: number;
  s2: number;
  live?: boolean;
  count?: number | null;
  board?: boolean;
}> = ({ width, s1, s2, live, count, board }) => {
  const frame = useCurrentFrame();
  const pulse = 0.6 + 0.4 * Math.abs(Math.sin(frame / 9));
  const row = (name: string, i: number, score: number, lead: boolean) => (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <FaceDot i={i} size={54} />
      <span style={{ flex: 1, fontFamily: display, fontWeight: 600, fontSize: 34, color: lead ? C.ink : C.ink2 }}>{name}</span>
      <span style={{ fontFamily: display, fontWeight: 700, fontSize: 40, color: lead ? C.ink : C.ink2, fontVariantNumeric: "tabular-nums" }}>{score}</span>
    </div>
  );
  return (
    <div
      style={{
        position: "relative",
        width,
        padding: 26,
        borderRadius: 20,
        background: `${C.surface}f2`,
        border: `1.5px solid ${live ? `${C.warm}66` : C.border}`,
        boxShadow: live ? `0 0 40px ${C.warm}22` : "none",
      }}
    >
      {live && (
        <div
          style={{
            position: "absolute",
            top: -16,
            right: 24,
            padding: "6px 14px",
            borderRadius: 999,
            background: C.warm,
            color: "#05060a",
            fontFamily: mono,
            fontWeight: 500,
            fontSize: 22,
            letterSpacing: "0.12em",
            opacity: pulse,
          }}
        >
          LIVE
        </div>
      )}
      {/* Watch count as a top-left header (mirrors the app), so it never sits on
          top of a player row. */}
      {count != null && (
        <div style={{ marginBottom: 16 }}>
          <WatchBadge count={count} />
        </div>
      )}
      {row("player one", 3, s1, s1 >= s2)}
      <div style={{ height: 1, background: C.border, margin: "16px 0" }} />
      {row("player two", 9, s2, s2 > s1)}

      {board && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
          <LiveBoard size={Math.min(width - 80, 320)} from={6} />
        </div>
      )}
    </div>
  );
};

/** A stream of emoji reactions rising and fading, spawned over time - the
 * "react" feature, shown rather than described. */
const EMOJI = ["🔥", "👏", "😮", "🎉", "🐐", "😭", "✨", "💪"];
export const FloatReactions: React.FC<{ rate?: number; from?: number }> = ({ rate = 3, from = 0 }) => {
  const frame = useCurrentFrame() - from;
  const { width } = useVideoConfig();
  if (frame < 0) return null;
  const items: React.ReactNode[] = [];
  // Spawn one every `rate` frames; each lives ~70 frames rising up.
  for (let s = 0; s <= frame; s += rate) {
    const age = frame - s;
    if (age > 80) continue;
    const idx = Math.floor(s / rate);
    const emoji = EMOJI[idx % EMOJI.length];
    const lane = (idx * 47) % 100;
    const x = width * (0.1 + (lane / 100) * 0.8);
    const drift = Math.sin(age / 12 + idx) * 26;
    const y = interpolate(age, [0, 80], [0, -520], clamp);
    const opacity = interpolate(age, [0, 8, 60, 80], [0, 1, 1, 0], clamp);
    const scale = interpolate(age, [0, 12], [0.5, 1], clamp);
    items.push(
      <div key={s} style={{ position: "absolute", left: x + drift, bottom: 120 + -y, fontSize: 64, opacity, transform: `scale(${scale})` }}>
        {emoji}
      </div>
    );
  }
  return <>{items}</>;
};
