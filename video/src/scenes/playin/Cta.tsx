import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SceneFade } from "../../shared";
import { C, WARM_GRADIENT } from "../../theme";
import { body, mono } from "../../fonts";
import { CenterFill, CupBg } from "./parts";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Beat 5 (15.5 to 18s). The close. The URL, then the warm "Enter early" pill,
 * then fade to black. */
export const Cta: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const url = interpolate(frame, [6, 24], [0, 1], clamp);
  const pill = spring({ frame: frame - 22, fps, config: { damping: 13, stiffness: 120, mass: 0.8 } });
  const glow = interpolate(Math.sin(frame / 9), [-1, 1], [0.45, 0.8]);

  return (
    <SceneFade durationInFrames={durationInFrames} inF={6} outF={22}>
      <CupBg warm={0.5} violet={0.12} />
      <CenterFill gap={52}>
        <div
          style={{
            opacity: url,
            transform: `translateY(${interpolate(url, [0, 1], [16, 0])}px)`,
            fontFamily: mono,
            fontWeight: 500,
            fontSize: 46,
          }}
        >
          <span style={{ color: C.ink2 }}>skycave.space</span>
          <span style={{ color: C.warmSoft }}>/tournament</span>
        </div>
        <div
          style={{
            opacity: pill,
            transform: `translateY(${interpolate(pill, [0, 1], [40, 0])}px) scale(${interpolate(pill, [0, 1], [0.9, 1])})`,
          }}
        >
          <div
            style={{
              padding: "34px 70px",
              borderRadius: 999,
              background: WARM_GRADIENT,
              color: C.warmInk,
              fontFamily: body,
              fontWeight: 600,
              fontSize: 52,
              letterSpacing: "-0.01em",
              boxShadow: `0 20px 70px rgba(255,110,60,${0.5 * glow})`,
            }}
          >
            Enter early
          </div>
        </div>
      </CenterFill>
    </SceneFade>
  );
};
