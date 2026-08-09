import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SceneFade } from "../../shared";
import { CupBg } from "../playin/parts";
import { APP, ConnectFour, EyeCount, WatchChrome, useCountUp } from "./parts";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Beat 2. You tapped WATCH and you're inside: the same board the players see,
 * discs dropping in live as you watch, the watcher count ticking up. Read-only
 * chrome (Bracket / WATCHING), no player prompts. */
export const Watch: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const wide = width >= height;
  const boardW = wide ? 560 : 680;
  const chrome = interpolate(frame, [4, 16], [0, 1], clamp);
  const boardIn = spring({ frame: frame - 8, fps, config: { damping: 16, stiffness: 130 } });
  const count = useCountUp(148, 12, 70);

  return (
    <SceneFade durationInFrames={durationInFrames} inF={8} outF={8}>
      <CupBg warm={0.3} violet={0.16} />
      <WatchChrome turnName="Caver to move" opacity={chrome} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ opacity: boardIn, transform: `scale(${interpolate(boardIn, [0, 1], [0.94, 1])})` }}>
          <ConnectFour width={boardW} from={10} />
        </div>
      </AbsoluteFill>
      <EyeCount n={count} />
    </SceneFade>
  );
};
