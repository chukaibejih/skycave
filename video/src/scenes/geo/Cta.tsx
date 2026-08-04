import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SceneFade } from "../../shared";
import { C } from "../../theme";
import { body, display, mono } from "../../fonts";
import { GeoBackground } from "./parts";

// The hub's own call-to-action: a violet→cyan pill, not the tournament's warm
// gradient. GeoGuess is a hub game, so it wears the hub's affordance.
const HUB_GRADIENT = `linear-gradient(135deg, ${"#8b7cff"} 0%, ${"#7c9dff"} 50%, ${"#67e8f9"} 100%)`;

/**
 * Beat 4 (11.5 to 15s). The close. The line "guess the place, closest pin wins"
 * settles, the URL fades up, and a violet pill lands: play a 1v1. Hold, fade to
 * black.
 */
export const Cta: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const line = interpolate(frame, [4, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const url = interpolate(frame, [16, 32], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pill = spring({ frame: frame - 30, fps, config: { damping: 13, stiffness: 120, mass: 0.8 } });
  const glow = interpolate(Math.sin(frame / 9), [-1, 1], [0.4, 0.8]);

  return (
    <SceneFade durationInFrames={durationInFrames} inF={8} outF={24}>
      <GeoBackground violet={0.5} cyan={0.34} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 46, padding: 40 }}>
        <div
          style={{
            opacity: line,
            transform: `translateY(${interpolate(line, [0, 1], [16, 0])}px)`,
            textAlign: "center",
            fontFamily: display,
            fontWeight: 700,
            fontSize: 66,
            lineHeight: 1.05,
            color: C.ink,
            textShadow: `0 0 50px ${C.violet}44`,
          }}
        >
          Guess the place.
          <br />
          Closest pin wins.
        </div>

        <div style={{ opacity: url, transform: `translateY(${interpolate(url, [0, 1], [14, 0])}px)`, fontFamily: mono, fontWeight: 500, fontSize: 44 }}>
          <span style={{ color: C.ink2 }}>skycave.space</span>
        </div>

        <div style={{ opacity: pill, transform: `translateY(${interpolate(pill, [0, 1], [40, 0])}px) scale(${interpolate(pill, [0, 1], [0.9, 1])})` }}>
          <div
            style={{
              padding: "34px 68px",
              borderRadius: 999,
              background: HUB_GRADIENT,
              color: "#05060a",
              fontFamily: body,
              fontWeight: 600,
              fontSize: 50,
              letterSpacing: "-0.01em",
              boxShadow: `0 20px 70px rgba(124,140,255,${0.55 * glow})`,
            }}
          >
            Play a 1v1
          </div>
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};
