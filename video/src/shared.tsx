import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C } from "./theme";

// A two-digit hex alpha from a 0..1 amount, so glows can be dialed per scene.
const a = (x: number) =>
  Math.round(Math.max(0, Math.min(1, x)) * 255)
    .toString(16)
    .padStart(2, "0");

/**
 * The shared space behind every scene. `violet` lifts the hub glow at the top;
 * `warm` bleeds the tournament's amber up from the bottom. Moving these two
 * across the film is how the picture travels from the hub into the cup.
 */
export const Background: React.FC<{ violet?: number; warm?: number }> = ({
  violet = 0,
  warm = 0,
}) => (
  <AbsoluteFill style={{ backgroundColor: C.base }}>
    <AbsoluteFill
      style={{
        background: `radial-gradient(62% 42% at 50% -10%, ${C.violet}${a(
          violet
        )}, transparent 66%)`,
      }}
    />
    <AbsoluteFill
      style={{
        background: `radial-gradient(90% 55% at 50% 112%, ${C.amber}${a(
          warm
        )}, transparent 70%)`,
      }}
    />
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, transparent 46%, ${C.coral}${a(
          warm * 0.42
        )} 128%)`,
      }}
    />
    {/* A faint vignette so text always sits on darkness at the edges. */}
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(120% 90% at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%)",
      }}
    />
  </AbsoluteFill>
);

/**
 * A drifting field of warm embers, so a talky scene has some life behind it
 * without pulling the eye off the words. Positions are derived from the index
 * (golden-angle spread), so it is deterministic and needs no random seed.
 */
export const Embers: React.FC<{ count?: number; tint?: string }> = ({
  count = 22,
  tint = C.gold,
}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      {Array.from({ length: count }, (_, i) => {
        const baseX = (i * 137.5) % 100; // percent across (golden angle)
        const baseY = (i * 51.3) % 100;
        const speed = 0.05 + (i % 5) * 0.02;
        const y = (((baseY - frame * speed) % 110) + 110) % 110; // wrap, drift up
        const size = 3 + (i % 4) * 2;
        const twinkle =
          0.12 + 0.22 * Math.abs(Math.sin(frame / (24 + (i % 11)) + i));
        const sway = Math.sin(frame / (40 + (i % 7)) + i * 2) * 2.4;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `calc(${baseX}% + ${sway}px)`,
              top: `${y - 5}%`,
              width: size,
              height: size,
              borderRadius: "50%",
              background: tint,
              opacity: twinkle,
              filter: `blur(0.5px) drop-shadow(0 0 ${size * 2}px ${tint})`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/**
 * Wraps a scene in a fast fade at its head and tail, so scene-to-scene reads as
 * a clean cut-with-a-breath rather than a hard jump. Frame is local to the
 * enclosing <Sequence>, which resets it to 0.
 */
export const SceneFade: React.FC<{
  durationInFrames: number;
  inF?: number;
  outF?: number;
  children: React.ReactNode;
}> = ({ durationInFrames, inF = 7, outF = 7, children }) => {
  const frame = useCurrentFrame();
  // Build a strictly-increasing range so an inF or outF of 0 (a hard cut on one
  // side) does not produce a duplicated keyframe, which interpolate rejects.
  const range: number[] = [0];
  const out: number[] = [inF > 0 ? 0 : 1];
  if (inF > 0) {
    range.push(inF);
    out.push(1);
  }
  if (outF > 0) {
    range.push(durationInFrames - outF);
    out.push(1);
  }
  range.push(durationInFrames);
  out.push(outF > 0 ? 0 : 1);
  const opacity = interpolate(frame, range, out, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};
