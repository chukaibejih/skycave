import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SceneFade } from "../../shared";
import { C } from "../../theme";
import { display } from "../../fonts";
import { CupBg } from "../playin/parts";
import { MatchCard } from "./parts";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Beat 2. Drop inside: the actual game is playing - a board floods live while
 * you watch, the count sitting in the corner. Shows that you see the real game,
 * not a scoreboard. One short line. */
export const Watch: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const wide = width >= height;
  const cardW = wide ? 520 : 640;
  const cardIn = spring({ frame: frame - 2, fps, config: { damping: 15, stiffness: 130 } });
  const line = interpolate(frame, [70, 86], [0, 1], clamp);

  return (
    <SceneFade durationInFrames={durationInFrames} inF={8} outF={8}>
      <CupBg warm={0.42} violet={0.12} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: wide ? 30 : 44 }}>
        <div
          style={{
            opacity: cardIn,
            transform: `scale(${interpolate(cardIn, [0, 1], [0.95, 1])})`,
          }}
        >
          <MatchCard width={cardW} s1={2} s2={1} live count={214} board />
        </div>

        <div
          style={{
            opacity: line,
            transform: `translateY(${interpolate(line, [0, 1], [14, 0])}px)`,
            fontFamily: display,
            fontWeight: 700,
            fontSize: wide ? 54 : 62,
            color: C.ink,
            textShadow: "0 2px 22px rgba(0,0,0,0.85)",
          }}
        >
          Watch it <span style={{ color: C.cyan }}>live.</span>
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};
