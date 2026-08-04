import React from "react";
import { AbsoluteFill, staticFile, useCurrentFrame } from "remotion";
import { C } from "../../theme";
import { display, mono } from "../../fonts";

// The two textures GeoGuess ships, copied verbatim from the app's public dir so
// the film shows the real map, not a lookalike.
export const SATELLITE = staticFile("textures/earth-satellite.jpg");
export const TERRAIN = staticFile("textures/earth-day.jpg");

// The exact marker colours from GeoGuess.tsx: your guess is violet, the target
// is mint. Keeping them identical is what makes a viewer recognise the game.
export const GUESS = "#6C63FF";
export const TARGET = "#4FFFB0";

/**
 * The hub's cool background: violet lifts from the top, a cyan wash sits low.
 * GeoGuess lives in the hub (not the warm tournament world), so its film stays
 * violet/cyan rather than borrowing the cup's amber.
 */
export const GeoBackground: React.FC<{ violet?: number; cyan?: number }> = ({
  violet = 0.5,
  cyan = 0.28,
}) => (
  <AbsoluteFill style={{ backgroundColor: C.base }}>
    <AbsoluteFill
      style={{
        background: `radial-gradient(60% 42% at 50% -8%, ${C.violet}${hex(violet)}, transparent 66%)`,
      }}
    />
    <AbsoluteFill
      style={{
        background: `radial-gradient(85% 55% at 50% 114%, ${C.cyan}${hex(cyan)}, transparent 70%)`,
      }}
    />
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(120% 90% at 50% 50%, transparent 55%, rgba(0,0,0,0.6) 100%)",
      }}
    />
  </AbsoluteFill>
);

const hex = (x: number) =>
  Math.round(Math.max(0, Math.min(1, x)) * 255)
    .toString(16)
    .padStart(2, "0");

export interface GeoMarker {
  lat: number;
  lng: number;
  color: string;
}

/**
 * The flat map, faithful to FlatPicker: a 2:1 equirectangular texture with a
 * translate+scale transform (origin centre), and glowing pins positioned by
 * lat/lng and inverse-scaled so they hold their size as the map zooms. `tx/ty`
 * are in canvas px, `s` is the same 1..15 scale the real component clamps to.
 */
export const FlatMap: React.FC<{
  texture: string;
  tx: number;
  ty: number;
  s: number;
  markers?: GeoMarker[];
  width: number; // the map's unscaled width in px (the 2:1 base)
}> = ({ texture, tx, ty, s, markers = [], width }) => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
    <div
      style={{
        position: "relative",
        width,
        aspectRatio: "2 / 1",
        backgroundImage: `url(${texture})`,
        backgroundSize: "100% 100%",
        backgroundRepeat: "no-repeat",
        transform: `translate(${tx}px, ${ty}px) scale(${s})`,
        transformOrigin: "center center",
        borderRadius: 6,
      }}
    >
      {markers.map((m, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `${((m.lng + 180) / 360) * 100}%`,
            top: `${((90 - m.lat) / 180) * 100}%`,
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: m.color,
            border: "3px solid rgba(5,6,10,0.85)",
            boxShadow: `0 0 16px ${m.color}, 0 0 34px ${m.color}aa`,
            transform: `translate(-50%, -50%) scale(${1 / s})`,
          }}
        />
      ))}
    </div>
  </AbsoluteFill>
);

/**
 * A believable globe for the 3D view: the equirectangular texture wrapped into a
 * disc, spherical shading on top, a cyan atmosphere ring around it, and a slow
 * spin by drifting the texture. Not a true sphere, but it reads as the app's
 * globe at a glance.
 */
export const Globe: React.FC<{
  texture: string;
  size: number;
  spin?: number; // 0..1 background drift
  markers?: GeoMarker[];
}> = ({ texture, size, spin = 0, markers = [] }) => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        boxShadow: `0 0 60px ${C.cyan}55, inset 0 0 60px rgba(0,0,0,0.7)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${texture})`,
          backgroundSize: "200% 100%",
          backgroundPosition: `${spin * 100}% 50%`,
          backgroundRepeat: "repeat-x",
        }}
      />
      {/* Spherical shading: light from upper-left, dark terminator lower-right. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(70% 70% at 34% 30%, rgba(255,255,255,0.28), transparent 55%), radial-gradient(90% 90% at 70% 78%, rgba(0,0,0,0.72), transparent 62%)",
        }}
      />
      {markers.map((m, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `${((m.lng + 180) / 360) * 100}%`,
            top: `${((90 - m.lat) / 180) * 100}%`,
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: m.color,
            border: "3px solid rgba(5,6,10,0.85)",
            boxShadow: `0 0 16px ${m.color}`,
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}
    </div>
    {/* Atmosphere halo. */}
    <div
      style={{
        position: "absolute",
        width: size + 26,
        height: size + 26,
        borderRadius: "50%",
        boxShadow: `0 0 70px 6px ${C.cyan}44`,
        pointerEvents: "none",
      }}
    />
  </AbsoluteFill>
);

/**
 * The two floating map tools, top-left, exactly as GeoGuess.tsx renders them:
 * circular, dark, blurred glass. Top button toggles Satellite/Terrain (mountain
 * icon over satellite, globe icon over terrain); the lower one shows the OTHER
 * view label ("2D" while in 3D), because the label names what a tap gives you.
 * `pressType`/`pressView` (0..1) push a button in to show it being tapped.
 */
export const ToggleStack: React.FC<{
  view: "2d" | "3d";
  mapType: "satellite" | "terrain";
  pressType?: number;
  pressView?: number;
  scale?: number;
}> = ({ view, mapType, pressType = 0, pressView = 0, scale = 1 }) => {
  const btn = (press: number, child: React.ReactNode) => (
    <div
      style={{
        width: 108 * scale,
        height: 108 * scale,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        border: "1px solid rgba(255,255,255,0.12)",
        background: `rgba(0,0,0,${0.4 + press * 0.2})`,
        backdropFilter: "blur(10px)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
        transform: `scale(${1 - press * 0.08})`,
      }}
    >
      {child}
    </div>
  );
  const iconSize = 48 * scale;
  return (
    <div style={{ position: "absolute", left: 56, top: 60, display: "flex", flexDirection: "column", gap: 26 }}>
      {btn(
        pressType,
        mapType === "satellite" ? (
          // Mountain (implies: tap for Terrain)
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: iconSize, height: iconSize }}>
            <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
          </svg>
        ) : (
          // Globe (implies: tap for Satellite)
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: iconSize, height: iconSize }}>
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        )
      )}
      {btn(
        pressView,
        <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 34 * scale, letterSpacing: "0.02em" }}>
          {view === "3d" ? "2D" : "3D"}
        </span>
      )}
    </div>
  );
};

/** The prompt, as in-game: a mono "FIND" kicker over the place in display bold. */
export const PromptChip: React.FC<{ place: string; opacity?: number }> = ({ place, opacity = 1 }) => (
  <div style={{ position: "absolute", top: 84, left: 0, right: 0, textAlign: "center", opacity }}>
    <div style={{ fontFamily: mono, fontSize: 26, letterSpacing: "0.24em", textTransform: "uppercase", color: C.ink2 }}>
      find
    </div>
    <div
      style={{
        marginTop: 8,
        fontFamily: display,
        fontWeight: 700,
        fontSize: 68,
        color: C.ink,
        textShadow: "0 2px 16px rgba(0,0,0,0.85)",
      }}
    >
      {place}
    </div>
  </div>
);

/** A soft touch ring, for showing a tap land on a control. `press` 0..1. */
export const TouchDot: React.FC<{ x: number; y: number; press: number }> = ({ x, y, press }) => {
  if (press <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 88,
        height: 88,
        marginLeft: -44,
        marginTop: -44,
        borderRadius: "50%",
        border: `3px solid ${C.cyan}`,
        background: `${C.cyan}22`,
        transform: `scale(${0.7 + (1 - press) * 0.9})`,
        opacity: press,
        boxShadow: `0 0 26px ${C.cyan}88`,
      }}
    />
  );
};

/** The dark scrims GeoGuess lays over the map, top and bottom, for legibility. */
export const Scrims: React.FC = () => (
  <>
    <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 320, background: `linear-gradient(180deg, ${C.base}, transparent)` }} />
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 420, background: `linear-gradient(0deg, ${C.base}, transparent)` }} />
  </>
);

// Convenience for scene captions living below the frame.
export { useCurrentFrame };
