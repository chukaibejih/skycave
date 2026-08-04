import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { C } from "./theme";
import { Hook } from "./scenes/geo/Hook";
import { PanZoom } from "./scenes/geo/PanZoom";
import { Toggles } from "./scenes/geo/Toggles";
import { Cta } from "./scenes/geo/Cta";

// Four beats, back to back, at 30fps. 450 frames = 15s exactly.
const SCENES = [
  { Comp: Hook, dur: 105 }, //  0.0 - 3.5s  the hook
  { Comp: PanZoom, dur: 135 }, //  3.5 - 8.0s  pan & zoom the flat map (hero)
  { Comp: Toggles, dur: 105 }, //  8.0 - 11.5s the redesigned toggles
  { Comp: Cta, dur: 105 }, // 11.5 - 15.0s the CTA
];

export const GeoGuessUpdate: React.FC = () => {
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

export const GEO_UPDATE_FRAMES = SCENES.reduce((n, s) => n + s.dur, 0);
