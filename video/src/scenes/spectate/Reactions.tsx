import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SceneFade } from "../../shared";
import { CupBg } from "../playin/parts";
import { ConnectFour, EyeCount, FloatReactions, ReactionBar, WatchChrome } from "./parts";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Beat 3. The reaction bar (Bluesky watchers) taps out emoji that storm up
 * over the live game. The feature, shown - the same board keeps playing behind. */
export const Reactions: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const wide = width >= height;
  const boardW = wide ? 460 : 560;
  const barIn = spring({ frame: frame - 10, fps, config: { damping: 16, stiffness: 130 } });

  return (
    <SceneFade durationInFrames={durationInFrames} inF={8} outF={8}>
      <CupBg warm={0.3} violet={0.16} />
      <WatchChrome turnName="Nova to move" opacity={1} />

      {/* The game keeps playing, pushed up to leave room for the reactions. */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: wide ? 150 : 360 }}>
        <ConnectFour width={boardW} from={0} />
      </AbsoluteFill>

      <FloatReactions rate={4} from={6} />

      {/* The reaction bar, tapped. */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: wide ? 70 : 230 }}>
        <div style={{ opacity: barIn, transform: `translateY(${interpolate(barIn, [0, 1], [24, 0])}px)` }}>
          <ReactionBar from={10} />
        </div>
      </AbsoluteFill>

      <EyeCount n={162} />
    </SceneFade>
  );
};
