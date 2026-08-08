import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SceneFade } from "../../shared";
import { C } from "../../theme";
import { display, mono } from "../../fonts";
import { CupBg } from "../playin/parts";
import { EyeGlyph } from "./parts";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Beat 4. The line and the address. */
export const Cta: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const wide = width >= height;
  const eye = spring({ frame: frame - 4, fps, config: { damping: 13, stiffness: 130 } });
  const title = spring({ frame: frame - 14, fps, config: { damping: 18, stiffness: 120 } });
  const url = interpolate(frame, [30, 46], [0, 1], clamp);

  return (
    <SceneFade durationInFrames={durationInFrames} inF={8} outF={6}>
      <CupBg warm={0.6} violet={0.1} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: wide ? 30 : 40 }}>
        <div style={{ opacity: eye, transform: `scale(${interpolate(eye, [0, 1], [0.7, 1])})`, filter: `drop-shadow(0 0 22px ${C.cyan}66)` }}>
          <EyeGlyph size={wide ? 92 : 110} color={C.cyan} stroke={2} />
        </div>

        <div
          style={{
            opacity: title,
            transform: `translateY(${interpolate(title, [0, 1], [20, 0])}px)`,
            fontFamily: display,
            fontWeight: 700,
            fontSize: wide ? 84 : 100,
            color: C.ink,
            textAlign: "center",
            lineHeight: 1.02,
            textShadow: "0 2px 26px rgba(0,0,0,0.85)",
          }}
        >
          Watch the cup <span style={{ color: C.warmSoft }}>live.</span>
        </div>

        <div style={{ opacity: url, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginTop: 8 }}>
          <div style={{ fontFamily: display, fontWeight: 700, fontSize: wide ? 44 : 52, color: C.ink }}>skycave.space</div>
          <div style={{ fontFamily: mono, fontSize: 26, letterSpacing: "0.2em", textTransform: "uppercase", color: C.ink2 }}>
            weekend cups
          </div>
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};
