import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SceneFade } from "../../shared";
import { C } from "../../theme";
import { mono } from "../../fonts";
import { CupBg } from "../playin/parts";
import { MatchCard, FaceDot, useCountUp } from "./parts";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Beat 1. A live game sits there, and a crowd streams in to watch it: faces fly
 * in from the edges as the watch count ticks up. No explanation - you can see
 * people gathering around a live match. */
export const Hook: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const wide = width >= height;
  const cardW = wide ? 560 : 620;
  const count = useCountUp(214, 22, 66);
  const cardIn = spring({ frame: frame - 4, fps, config: { damping: 16, stiffness: 120 } });

  const FACES = 9;
  const gap = 30;
  return (
    <SceneFade durationInFrames={durationInFrames} inF={8} outF={8}>
      <CupBg warm={0.4} violet={0.14} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: wide ? 44 : 60 }}>
        <div
          style={{
            fontFamily: mono,
            fontSize: 30,
            letterSpacing: "0.26em",
            textTransform: "uppercase",
            color: C.cyan,
            opacity: interpolate(frame, [0, 14], [0, 1], clamp),
          }}
        >
          Spectating
        </div>

        <div
          style={{
            opacity: cardIn,
            transform: `translateY(${interpolate(cardIn, [0, 1], [26, 0])}px) scale(${interpolate(cardIn, [0, 1], [0.96, 1])})`,
          }}
        >
          <MatchCard width={cardW} s1={2} s2={1} live count={count} />
        </div>

        {/* The crowd, streaming in from both edges into an audience cluster. */}
        <div style={{ position: "relative", height: 70, width: cardW }}>
          {Array.from({ length: FACES }, (_, i) => {
            const t = spring({ frame: frame - 20 - i * 4, fps, config: { damping: 18, stiffness: 120 } });
            const targetX = cardW / 2 - (FACES * gap) / 2 + i * gap;
            const fromX = i % 2 ? cardW + 140 : -140;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: interpolate(t, [0, 1], [fromX, targetX]),
                  top: interpolate(t, [0, 1], [50, 0]),
                  opacity: t,
                }}
              >
                <FaceDot i={i + 2} size={46} ring={i === FACES - 1} />
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};
