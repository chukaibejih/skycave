import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Background, SceneFade } from "../shared";
import { C } from "../theme";
import { display } from "../fonts";

/**
 * Scene 2 (4 to 10s). The reveal. "WEEKEND CUP" snaps up with a spring
 * overshoot while the world turns warm, amber bleeding up from the floor, the
 * same tone as the tournament banner in the app. A small "SKYCAVE" sits above
 * it in warm orange: we have arrived in the cup.
 */
export const Title: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // The world warms up over the first ~1.2s and holds.
  const warm = interpolate(frame, [0, 36], [0, 0.62], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // A trace of violet still hangs at the top, fading as the warmth takes over.
  const violet = interpolate(frame, [0, 40], [0.42, 0.14], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Eyebrow.
  const eyebrow = spring({ frame: frame - 6, fps, config: { damping: 200 } });

  // The slam: quick upward snap with overshoot.
  const slam = spring({
    frame: frame - 14,
    fps,
    config: { damping: 12, stiffness: 130, mass: 0.85 },
  });
  const slamY = interpolate(slam, [0, 1], [90, 0]);

  // Shimmer sweep across the wordmark once it has landed.
  const shimmer = interpolate(frame, [40, 96], [-40, 140], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneFade durationInFrames={durationInFrames} inF={12} outF={8}>
      <Background violet={violet} warm={warm} />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            fontFamily: display,
            fontWeight: 700,
            fontSize: 40,
            letterSpacing: "0.42em",
            paddingLeft: "0.42em",
            color: C.warmSoft,
            opacity: eyebrow,
            transform: `translateY(${interpolate(eyebrow, [0, 1], [20, 0])}px)`,
            textShadow: `0 0 26px ${C.warm}66`,
          }}
        >
          SKYCAVE
        </div>

        <div
          style={{
            opacity: slam,
            transform: `translateY(${slamY}px)`,
            textAlign: "center",
            lineHeight: 0.98,
            position: "relative",
          }}
        >
          <TitleWord text="WEEKEND" shimmer={shimmer} />
          <TitleWord text="CUP" shimmer={shimmer} big />
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};

const TitleWord: React.FC<{ text: string; shimmer: number; big?: boolean }> = ({
  text,
  shimmer,
  big,
}) => (
  <div
    style={{
      position: "relative",
      fontFamily: display,
      fontWeight: 700,
      fontSize: big ? 200 : 150,
      letterSpacing: "-0.02em",
      color: C.ink,
      textShadow: `0 0 60px ${C.amber}55, 0 8px 40px rgba(0,0,0,0.5)`,
    }}
  >
    {text}
    {/* a warm gloss sweeping left to right */}
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: `linear-gradient(105deg, transparent ${shimmer - 18}%, ${
          C.gold
        }cc ${shimmer}%, transparent ${shimmer + 18}%)`,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        mixBlendMode: "screen",
      }}
    >
      {text}
    </div>
  </div>
);
