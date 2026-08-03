import React from "react";
import { Composition } from "remotion";
import { FPS, WIDTH, HEIGHT } from "./theme";
import { WeekendCup, WEEKEND_CUP_FRAMES } from "./WeekendCup";

export const RemotionRoot: React.FC = () => (
  <>
    {/* Vertical cut, for mobile and Bluesky sharing. */}
    <Composition
      id="WeekendCup"
      component={WeekendCup}
      durationInFrames={WEEKEND_CUP_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    {/* 16:9 cut, for everywhere a wide frame reads better. Same scenes, which
        reflow off the canvas size. */}
    <Composition
      id="WeekendCupWide"
      component={WeekendCup}
      durationInFrames={WEEKEND_CUP_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
    />
  </>
);
