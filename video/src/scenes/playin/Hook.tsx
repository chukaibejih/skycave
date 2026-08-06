import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SceneFade } from "../../shared";
import { C } from "../../theme";
import { display } from "../../fonts";
import { CupBg } from "./parts";

/** Beat 1 (0 to 3.5s). The hook. WEEKEND CUP slams up out of the warm floor,
 * then a quiet promise settles under it: "a fairer draw." */
export const Hook: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const wide = width >= height;

  const warm = interpolate(frame, [0, 34], [0.2, 0.6], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const eyebrow = spring({ frame: frame - 4, fps, config: { damping: 200 } });
  const slam = spring({ frame: frame - 12, fps, config: { damping: 12, stiffness: 130, mass: 0.85 } });
  const sub = interpolate(frame, [34, 54], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <SceneFade durationInFrames={durationInFrames} inF={10} outF={8}>
      <CupBg warm={warm} violet={0.14} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 10 }}>
        <div
          style={{
            fontFamily: display,
            fontWeight: 700,
            fontSize: 36,
            letterSpacing: "0.42em",
            paddingLeft: "0.42em",
            color: C.warmSoft,
            opacity: eyebrow,
            transform: `translateY(${interpolate(eyebrow, [0, 1], [18, 0])}px)`,
            textShadow: `0 0 26px ${C.warm}66`,
          }}
        >
          SKYCAVE
        </div>
        <div
          style={{
            opacity: slam,
            transform: `translateY(${interpolate(slam, [0, 1], [80, 0])}px)`,
            fontFamily: display,
            fontWeight: 700,
            fontSize: wide ? 150 : 128,
            letterSpacing: "-0.02em",
            color: C.ink,
            lineHeight: 0.98,
            textAlign: "center",
            textShadow: `0 0 60px ${C.amber}55, 0 8px 40px rgba(0,0,0,0.5)`,
          }}
        >
          WEEKEND CUP
        </div>
        <div
          style={{
            opacity: sub,
            transform: `translateY(${interpolate(sub, [0, 1], [12, 0])}px)`,
            fontFamily: display,
            fontWeight: 500,
            fontSize: 42,
            letterSpacing: "0.04em",
            color: C.gold,
          }}
        >
          a fairer draw
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};
