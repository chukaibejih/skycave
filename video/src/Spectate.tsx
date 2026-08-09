import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { C } from "./theme";
import { Bracket } from "./scenes/spectate/Bracket";
import { Watch } from "./scenes/spectate/Watch";
import { Reactions } from "./scenes/spectate/Reactions";
import { Cta } from "./scenes/spectate/Cta";

// Show, don't tell, in the real app UI: it starts on the bracket at a live
// fixture, you tap WATCH, drop into the game as it plays, reactions storm up,
// then the address. Four beats at 30fps, ~16s.
const SCENES = [
  { Comp: Bracket, dur: 140 }, //  0.0 - 4.7s  the bracket: a live fixture, tap WATCH
  { Comp: Watch, dur: 130 }, //  4.7 - 9.0s  inside: the game plays as you watch
  { Comp: Reactions, dur: 120 }, //  9.0 - 13.0s reactions storm up
  { Comp: Cta, dur: 90 }, // 13.0 - 16.0s the line + the address
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
