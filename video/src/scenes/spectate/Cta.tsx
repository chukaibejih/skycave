import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SceneFade } from "../../shared";
import { CupBg } from "../playin/parts";
import { display, mono } from "../../fonts";
import { APP, EyeIcon } from "./parts";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Beat 4. The line and the address - it's the Skycave Weekend Tournament. */
export const Cta: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const wide = width >= height;
  const eye = spring({ frame: frame - 4, fps, config: { damping: 13, stiffness: 130 } });
  const title = spring({ frame: frame - 14, fps, config: { damping: 18, stiffness: 120 } });
  const url = interpolate(frame, [30, 46], [0, 1], clamp);

  return (
    <SceneFade durationInFrames={durationInFrames} inF={8} outF={6}>
      <CupBg warm={0.5} violet={0.12} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: wide ? 28 : 38 }}>
        <div style={{ opacity: eye, transform: `scale(${interpolate(eye, [0, 1], [0.7, 1])})`, filter: `drop-shadow(0 0 22px ${APP.cyan}66)` }}>
          <EyeIcon size={wide ? 88 : 104} color={APP.cyan} stroke={2} />
        </div>

        <div
          style={{
            opacity: title,
            transform: `translateY(${interpolate(title, [0, 1], [20, 0])}px)`,
            fontFamily: display,
            fontWeight: 700,
            fontSize: wide ? 82 : 96,
            color: APP.ink,
            textAlign: "center",
            lineHeight: 1.02,
            textShadow: "0 2px 26px rgba(0,0,0,0.85)",
          }}
        >
          Watch it <span style={{ color: APP.warm }}>live.</span>
        </div>

        <div style={{ opacity: url, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginTop: 8 }}>
          <div
            style={{
              fontFamily: mono,
              fontSize: wide ? 24 : 26,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: APP.warm,
            }}
          >
            Skycave Weekend Tournament
          </div>
          <div style={{ fontFamily: display, fontWeight: 700, fontSize: wide ? 44 : 52, color: APP.ink }}>skycave.space</div>
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};
