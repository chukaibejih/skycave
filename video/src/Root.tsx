import React from "react";
import { Composition } from "remotion";
import { FPS, WIDTH, HEIGHT } from "./theme";
import { WeekendCup, WEEKEND_CUP_FRAMES } from "./WeekendCup";
import { GeoGuessUpdate, GEO_UPDATE_FRAMES } from "./GeoGuessUpdate";
import { PlayIn, PLAYIN_FRAMES } from "./PlayIn";

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

    {/* GeoGuess map update: pan/zoom + redesigned toggles. Vertical + wide, the
        same four scenes reflowing off the canvas size. */}
    <Composition
      id="GeoGuessUpdate"
      component={GeoGuessUpdate}
      durationInFrames={GEO_UPDATE_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="GeoGuessUpdateWide"
      component={GeoGuessUpdate}
      durationInFrames={GEO_UPDATE_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
    />

    {/* Play-in rule explainer: byes are gone, the last to register face a
        play-in, register early to skip it. Vertical + wide. */}
    <Composition
      id="PlayIn"
      component={PlayIn}
      durationInFrames={PLAYIN_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="PlayInWide"
      component={PlayIn}
      durationInFrames={PLAYIN_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
    />
  </>
);
