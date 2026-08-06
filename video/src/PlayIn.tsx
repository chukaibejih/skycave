import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { C } from "./theme";
import { Hook } from "./scenes/playin/Hook";
import { OldWay } from "./scenes/playin/OldWay";
import { Gate } from "./scenes/playin/Gate";
import { Incentive } from "./scenes/playin/Incentive";
import { Cta } from "./scenes/playin/Cta";

// Five beats at 30fps. 540 frames = 18s: byes were free and empty, the play-in
// makes the spot earned, and you avoid it by registering early.
const SCENES = [
  { Comp: Hook, dur: 105 }, //  0.0 - 3.5s  the hook
  { Comp: OldWay, dur: 120 }, //  3.5 - 7.5s  the old way (byes)
  { Comp: Gate, dur: 150 }, //  7.5 - 12.5s the play-in gate (hero)
  { Comp: Incentive, dur: 90 }, // 12.5 - 15.5s register early, skip it
  { Comp: Cta, dur: 75 }, // 15.5 - 18.0s the CTA
];

export const PlayIn: React.FC = () => {
  let at = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: C.base }}>
      {SCENES.map(({ Comp, dur }, i) => {
        const from = at;
        at += dur;
        return (
          <Sequence key={i} from={from} durationInFrames={dur}>
            <Comp durationInFrames={dur} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export const PLAYIN_FRAMES = SCENES.reduce((n, s) => n + s.dur, 0);
