import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SceneFade } from "../../shared";
import { C } from "../../theme";
import { mono } from "../../fonts";
import { CupBg } from "../playin/parts";
import { MatchCard, FloatReactions } from "./parts";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const BAR = ["🔥", "👏", "😮", "🎉", "🐐"];

/** Beat 3. Emoji reactions storm up over the live game, spawned from a reaction
 * bar whose buttons pulse as they're tapped. The feature, shown - not captioned. */
export const Reactions: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const wide = width >= height;
  const cardW = wide ? 500 : 600;
  const cardIn = spring({ frame: frame - 2, fps, config: { damping: 16, stiffness: 130 } });
  const barIn = spring({ frame: frame - 12, fps, config: { damping: 16, stiffness: 130 } });

  return (
    <SceneFade durationInFrames={durationInFrames} inF={8} outF={8}>
      <CupBg warm={0.42} violet={0.12} />

      {/* The live game, pushed up to leave room for the rising reactions. */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: wide ? 90 : 300 }}>
        <div style={{ opacity: cardIn, transform: `scale(${interpolate(cardIn, [0, 1], [0.95, 1])})` }}>
          <MatchCard width={cardW} s1={2} s2={2} live count={231} />
        </div>
      </AbsoluteFill>

      {/* The reactions themselves, flying up over everything. */}
      <FloatReactions rate={4} from={8} />

      {/* The reaction bar, tapped: each button pulses on its beat. */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: wide ? 60 : 240 }}>
        <div
          style={{
            opacity: barIn,
            transform: `translateY(${interpolate(barIn, [0, 1], [24, 0])}px)`,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: 12,
            borderRadius: 999,
            background: `${C.surface}e6`,
            border: `1.5px solid ${C.border}`,
          }}
        >
          {BAR.map((e, i) => {
            // Each button "taps" in turn: a quick scale pop on its beat.
            const beat = 16 + i * 9;
            const tap = interpolate(frame, [beat, beat + 5, beat + 12], [1, 1.5, 1], clamp);
            return (
              <div key={e} style={{ width: 68, height: 68, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 40, transform: `scale(${tap})` }}>
                {e}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: wide ? 24 : 200 }}>
        <div style={{ fontFamily: mono, fontSize: 30, letterSpacing: "0.24em", textTransform: "uppercase", color: C.cyan, opacity: interpolate(frame, [4, 18], [0, 1], clamp) }}>
          React live
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};
