import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SceneFade } from "../../shared";
import { C } from "../../theme";
import { display } from "../../fonts";
import { GeoBackground, Globe, SATELLITE } from "./parts";

/**
 * Beat 1 (0 to 3.5s). The hook. A globe spins up behind the SKYCAVE eyebrow,
 * then "GEO GUESS" slams in with the sub "a sharper map". Hub colours (violet
 * top, cyan low), so it reads as the same product the game lives in.
 */
export const Hook: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const wide = width >= height;

  const eyebrow = spring({ frame: frame - 4, fps, config: { damping: 200 } });
  const slam = spring({ frame: frame - 12, fps, config: { damping: 12, stiffness: 130, mass: 0.85 } });
  const slamY = interpolate(slam, [0, 1], [80, 0]);
  const sub = interpolate(frame, [30, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const spin = interpolate(frame, [0, durationInFrames], [0, 0.35]);
  const globeSize = wide ? 360 : 460;

  return (
    <SceneFade durationInFrames={durationInFrames} inF={10} outF={8}>
      <GeoBackground violet={0.55} cyan={0.26} />

      {/* Globe drifts high, dimmed, as a backdrop to the wordmark. */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: wide ? 40 : 230, opacity: 0.5 }}>
        <Globe texture={SATELLITE} size={globeSize} spin={spin} />
      </AbsoluteFill>

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 10 }}>
        <div
          style={{
            fontFamily: display,
            fontWeight: 700,
            fontSize: 36,
            letterSpacing: "0.42em",
            paddingLeft: "0.42em",
            color: C.cyan,
            opacity: eyebrow,
            transform: `translateY(${interpolate(eyebrow, [0, 1], [18, 0])}px)`,
            textShadow: `0 0 26px ${C.cyan}66`,
          }}
        >
          SKYCAVE
        </div>
        <div
          style={{
            opacity: slam,
            transform: `translateY(${slamY}px)`,
            fontFamily: display,
            fontWeight: 700,
            fontSize: wide ? 150 : 128,
            letterSpacing: "-0.02em",
            color: C.ink,
            textShadow: `0 0 60px ${C.violet}66, 0 8px 40px rgba(0,0,0,0.5)`,
            lineHeight: 0.98,
            textAlign: "center",
          }}
        >
          GEO GUESS
        </div>
        <div
          style={{
            opacity: sub,
            transform: `translateY(${interpolate(sub, [0, 1], [12, 0])}px)`,
            fontFamily: display,
            fontWeight: 500,
            fontSize: 40,
            letterSpacing: "0.06em",
            color: C.violet,
          }}
        >
          a sharper map
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};
