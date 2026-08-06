import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SceneFade } from "../../shared";
import { C } from "../../theme";
import { Caption, CenterFill, CupBg, SeatPill } from "./parts";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Beat 4 (12.5 to 15.5s). The incentive, and the whole point: register early
 * and your seat is already yours - the play-in never touches you. */
export const Incentive: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const wide = width >= height;

  const pop = spring({ frame: frame - 8, fps, config: { damping: 12, stiffness: 130, mass: 0.8 } });
  const cap = interpolate(frame, [24, 44], [0, 1], clamp);

  return (
    <SceneFade durationInFrames={durationInFrames} inF={8} outF={8}>
      <CupBg warm={0.5} violet={0.12} />
      <CenterFill gap={46}>
        <div
          style={{
            opacity: pop,
            transform: `scale(${interpolate(pop, [0, 1], [0.9, 1])})`,
            filter: `drop-shadow(0 0 26px ${C.gold}44)`,
          }}
        >
          <SeatPill tone="gold" label="your seat" tag="reserved ✓" width={wide ? 440 : 520} />
        </div>
        <div style={{ opacity: cap, transform: `translateY(${interpolate(cap, [0, 1], [14, 0])}px)` }}>
          <Caption
            kicker="register early"
            title={
              <>
                Skip the play-in <span style={{ color: C.gold }}>entirely.</span>
              </>
            }
            size={wide ? 72 : 78}
          />
        </div>
      </CenterFill>
    </SceneFade>
  );
};
