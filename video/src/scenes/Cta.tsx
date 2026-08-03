import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Background, SceneFade } from "../shared";
import { C, WARM_GRADIENT } from "../theme";
import { body, mono } from "../fonts";

/**
 * Scene 5 (24 to 30s). Clean cut to dark. The URL fades in centered in mono,
 * then the warm "Enter the tournament" pill lands beneath it. Hold, then fade
 * to black. The pill wears the tournament world's gradient, the same warm
 * affordance the app uses to enter the cup.
 */
export const Cta: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const url = interpolate(frame, [6, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const urlY = interpolate(frame, [6, 24], [18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Pill lands half a second after the URL, with a gentle overshoot.
  const pill = spring({
    frame: frame - 22,
    fps,
    config: { damping: 13, stiffness: 120, mass: 0.8 },
  });

  const glow = interpolate(Math.sin(frame / 9), [-1, 1], [0.45, 0.8]);

  return (
    <SceneFade durationInFrames={durationInFrames} inF={6} outF={22}>
      <Background warm={0.16} />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          gap: 56,
        }}
      >
        <div
          style={{
            opacity: url,
            transform: `translateY(${urlY}px)`,
            fontFamily: mono,
            fontWeight: 500,
            fontSize: 46,
            letterSpacing: "0.01em",
            color: C.ink,
          }}
        >
          <span style={{ color: C.ink2 }}>skycave.space</span>
          <span style={{ color: C.warmSoft }}>/tournament</span>
        </div>

        <div
          style={{
            opacity: pill,
            transform: `translateY(${interpolate(pill, [0, 1], [40, 0])}px) scale(${interpolate(
              pill,
              [0, 1],
              [0.9, 1]
            )})`,
          }}
        >
          <div
            style={{
              position: "relative",
              padding: "36px 74px",
              borderRadius: 999,
              background: WARM_GRADIENT,
              color: C.warmInk,
              fontFamily: body,
              fontWeight: 600,
              fontSize: 54,
              letterSpacing: "-0.01em",
              boxShadow: `0 20px 70px rgba(255,110,60,${0.5 * glow})`,
            }}
          >
            Enter the tournament
          </div>
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};
