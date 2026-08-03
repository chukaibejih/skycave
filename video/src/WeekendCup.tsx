import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { C } from "./theme";
import { Title } from "./scenes/Title";
import { HowItWorks } from "./scenes/HowItWorks";
import { Games } from "./scenes/Games";
import { Bracket } from "./scenes/Bracket";
import { Cta } from "./scenes/Cta";

// The five beats, back to back, at 30fps. 900 frames = 30s exactly, the ceiling.
const SCENES = [
  { Comp: Title, dur: 150 }, // 0 - 5s    the title (now the opener)
  { Comp: HowItWorks, dur: 180 }, // 5 - 11s   how it works
  { Comp: Games, dur: 210 }, // 11 - 18s  the games in the pot
  { Comp: Bracket, dur: 180 }, // 18 - 24s  the bracket
  { Comp: Cta, dur: 180 }, // 24 - 30s  the CTA
];

export const WeekendCup: React.FC = () => {
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

export const WEEKEND_CUP_FRAMES = SCENES.reduce((n, s) => n + s.dur, 0);
