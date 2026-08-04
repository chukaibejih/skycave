import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { SceneFade } from "../../shared";
import { C } from "../../theme";
import { display, mono } from "../../fonts";
import { FlatMap, GeoBackground, Globe, Scrims, ToggleStack, TouchDot, SATELLITE, TERRAIN } from "./parts";

const pulse = (f: number, a: number, b: number) => {
  const m = (a + b) / 2;
  return f < a || f > b ? 0 : 1 - Math.abs(f - m) / ((b - a) / 2);
};
const fade = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

/**
 * Beat 3 (8 to 11.5s). The redesigned toggles. A tap on the "2D" button flips
 * the globe to the flat map; a tap on the type button swaps satellite for
 * terrain. The two circular glass buttons, the touch rings, and the label logic
 * (a button names what a tap gives you) all match GeoGuess.tsx.
 */
export const Toggles: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const wide = width >= height;
  const W = wide ? width * 0.9 : width * 1.1;

  // State transitions, driven by the taps.
  const view: "2d" | "3d" = frame < 44 ? "3d" : "2d";
  const mapType: "satellite" | "terrain" = frame < 66 ? "satellite" : "terrain";
  const pressView = pulse(frame, 28, 42);
  const pressType = pulse(frame, 56, 68);

  // Layer opacities: globe -> flat(satellite) -> flat(terrain).
  const globeO = 1 - fade(frame, 40, 48);
  const flatSatO = fade(frame, 40, 48) * (1 - fade(frame, 62, 70));
  const flatTerO = fade(frame, 62, 70);

  const spin = interpolate(frame, [0, 44], [0, 0.16]);
  // A gentle life on the flat map.
  const s = 1.25;
  const tx = interpolate(frame, [44, durationInFrames], [40, -40]);

  // Touch ring: on the view button first, then the type button.
  const onType = frame >= 50;
  const touchX = 110;
  const touchY = onType ? 114 : 248;
  const press = onType ? pressType : pressView;

  const cap = fade(frame, 12, 30);

  return (
    <SceneFade durationInFrames={durationInFrames} inF={8} outF={8}>
      <GeoBackground violet={0.5} cyan={0.3} />

      <AbsoluteFill style={{ opacity: globeO }}>
        <Globe texture={SATELLITE} size={wide ? 520 : 620} spin={spin} />
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: flatSatO }}>
        <FlatMap texture={SATELLITE} tx={tx} ty={0} s={s} width={W} />
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: flatTerO }}>
        <FlatMap texture={TERRAIN} tx={tx} ty={0} s={s} width={W} />
      </AbsoluteFill>

      <Scrims />
      <ToggleStack view={view} mapType={mapType} pressView={pressView} pressType={pressType} />
      <TouchDot x={touchX} y={touchY} press={press} />

      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: wide ? 90 : 300 }}>
        <div style={{ opacity: cap, textAlign: "center" }}>
          <div style={{ fontFamily: mono, fontSize: 24, letterSpacing: "0.22em", textTransform: "uppercase", color: C.cyan }}>
            redesigned toggles
          </div>
          <div style={{ marginTop: 10, fontFamily: display, fontWeight: 700, fontSize: wide ? 70 : 74, color: C.ink, textShadow: "0 2px 20px rgba(0,0,0,0.9)" }}>
            Globe ⇄ Flat · Satellite ⇄ Terrain
          </div>
          <div style={{ marginTop: 12, fontFamily: display, fontWeight: 500, fontSize: 38, color: C.ink2 }}>
            one tap, and it remembers next time
          </div>
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};
