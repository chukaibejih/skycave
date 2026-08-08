import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { C } from "./theme";
import { Hook } from "./scenes/spectate/Hook";
import { Watch } from "./scenes/spectate/Watch";
import { Reactions } from "./scenes/spectate/Reactions";
import { Cta } from "./scenes/spectate/Cta";

// Four beats at 30fps, ~15s. Show, don't tell: a crowd gathers on a live game,
// you drop in and watch it play, reactions storm up, then the address.
const SCENES = [
  { Comp: Hook, dur: 110 }, //  0.0 - 3.7s  a live game + a crowd streaming in
  { Comp: Watch, dur: 130 }, //  3.7 - 8.0s  drop in: the game plays as you watch
  { Comp: Reactions, dur: 120 }, // 8.0 - 12.0s reactions storm up
  { Comp: Cta, dur: 90 }, // 12.0 - 15.0s the line + the address
];

export const Spectate: React.FC = () => {
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

export const SPECTATE_FRAMES = SCENES.reduce((n, s) => n + s.dur, 0);
