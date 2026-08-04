import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SceneFade } from "../../shared";
import { C } from "../../theme";
import { display, mono } from "../../fonts";
import { FlatMap, GeoBackground, PromptChip, Scrims, ToggleStack, TERRAIN, GUESS } from "./parts";

/**
 * Beat 2 (3.5 to 8s). The hero feature: pan and zoom on the flat map. The whole
 * world eases in, drifts, then zooms deep into Kyoto while keeping it centred,
 * exactly the translate+scale FlatPicker does. A violet guess pin drops on the
 * target; the "PAN + ZOOM" caption and the in-game prompt/toggles frame it.
 */
export const PanZoom: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const wide = width >= height;

  // The map's unscaled base width, sized to the canvas so it fills either cut.
  const W = wide ? width * 0.96 : width * 1.12;
  const H = W / 2;

  // Target: Kyoto. Offset (px, from map centre) of that lat/lng on the base map.
  const lng = 135.77;
  const lat = 35.01;
  const ox = (lng / 360) * W; // east of centre
  const oy = ((90 - lat) / 180 - 0.5) * H; // below centre (negative = north)

  // Zoom: hold wide with a slow pan, then push in to the target and settle.
  const s = interpolate(frame, [8, 40, 96], [1, 1, 5.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Early drift across the world while still wide (pure pan), before the push-in.
  const drift = interpolate(frame, [8, 40], [70, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // Lock onto the target as we zoom (origin is centre, so tx = -ox*s centres it).
  const lock = interpolate(frame, [40, 96], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tx = drift + lock * (-ox * s);
  const ty = lock * (-oy * s);

  // The guess pin drops once we are zoomed in.
  const pinDrop = spring({ frame: frame - 92, fps, config: { damping: 11, stiffness: 140, mass: 0.7 } });
  const markers = pinDrop > 0.02 ? [{ lat, lng, color: GUESS }] : [];

  const cap = interpolate(frame, [46, 66], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <SceneFade durationInFrames={durationInFrames} inF={8} outF={8}>
      <GeoBackground violet={0.4} cyan={0.34} />
      <AbsoluteFill style={{ opacity: interpolate(pinDrop, [0, 1], [1, 1]) }}>
        <FlatMap texture={TERRAIN} tx={tx} ty={ty} s={s} width={W} markers={markers} />
      </AbsoluteFill>

      <Scrims />
      <PromptChip place="Kyoto" opacity={interpolate(frame, [4, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
      <ToggleStack view="2d" mapType="terrain" />

      {/* Caption, lower third. */}
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: wide ? 90 : 300 }}>
        <div style={{ opacity: cap, transform: `translateY(${interpolate(cap, [0, 1], [16, 0])}px)`, textAlign: "center" }}>
          <div style={{ fontFamily: mono, fontSize: 24, letterSpacing: "0.22em", textTransform: "uppercase", color: C.cyan }}>
            new
          </div>
          <div style={{ marginTop: 10, fontFamily: display, fontWeight: 700, fontSize: wide ? 76 : 82, color: C.ink, textShadow: "0 2px 20px rgba(0,0,0,0.9)" }}>
            Pan &amp; zoom the flat map
          </div>
          <div style={{ marginTop: 12, fontFamily: display, fontWeight: 500, fontSize: 38, color: C.ink2 }}>
            drop your pin with pinpoint precision
          </div>
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};
