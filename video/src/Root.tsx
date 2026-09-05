import React from "react";
import { Composition } from "remotion";
import { FPS, WIDTH, HEIGHT } from "./theme";
import { WeekendCup, WEEKEND_CUP_FRAMES } from "./WeekendCup";
import { GeoGuessUpdate, GEO_UPDATE_FRAMES } from "./GeoGuessUpdate";
import { PlayIn, PLAYIN_FRAMES } from "./PlayIn";
import { Spectate, SPECTATE_FRAMES } from "./Spectate";
import { SpectateThumb } from "./Thumbnail";
import { CupCard } from "./CupCard";
import { RulesIntro, Rule01, Rule02, Rule03, Rule04 } from "./RulesCards";
import { TournamentPoolUpdateCard } from "./TournamentPoolUpdateCard";

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

    {/* Spectating announcement: watch a live tournament game + react. Shown, not
        captioned. Vertical + wide, the same scenes reflowing off the canvas. */}
    <Composition
      id="Spectate"
      component={Spectate}
      durationInFrames={SPECTATE_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="SpectateWide"
      component={Spectate}
      durationInFrames={SPECTATE_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
    />

    {/* Spectating cover/thumbnail (still). Landscape 16:9 + vertical 9:16. */}
    <Composition id="SpectateThumb" component={SpectateThumb} durationInFrames={1} fps={FPS} width={1920} height={1080} />
    <Composition id="SpectateThumbVert" component={SpectateThumb} durationInFrames={1} fps={FPS} width={WIDTH} height={HEIGHT} />

    {/* Weekend-tournament announcement card (still), ocean/beach theme with the
        registration countdown. Landscape 16:9 + square for Bluesky. */}
    <Composition id="CupCard" component={CupCard} durationInFrames={1} fps={FPS} width={1600} height={900} />
    <Composition id="CupCardSquare" component={CupCard} durationInFrames={1} fps={FPS} width={1200} height={1200} />

    {/* Tournament rules announcement, a 5-card set (square 1080). Stable Skycave
        brand (not the weekly skin): dark ground, gold accent, faint bracket.
        Card 01 ticks the 120s move clock down as a timelapse. */}
    <Composition id="RulesIntro" component={RulesIntro} durationInFrames={90} fps={FPS} width={1080} height={1080} />
    <Composition id="Rule01" component={Rule01} durationInFrames={130} fps={FPS} width={1080} height={1080} />
    <Composition id="Rule02" component={Rule02} durationInFrames={110} fps={FPS} width={1080} height={1080} />
    <Composition id="Rule03" component={Rule03} durationInFrames={110} fps={FPS} width={1080} height={1080} />
    <Composition id="Rule04" component={Rule04} durationInFrames={110} fps={FPS} width={1080} height={1080} />

    {/* Single post: Color Clash enters the next tournament pool; Dots and
        Boxes leaves it. Render a still for the announcement account. */}
    <Composition id="TournamentPoolUpdateCard" component={TournamentPoolUpdateCard} durationInFrames={90} fps={FPS} width={1080} height={1080} />
  </>
);
