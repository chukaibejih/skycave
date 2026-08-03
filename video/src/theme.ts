// The Skycave palette, split into the two worlds the video moves between:
// the cool violet hub, and the warm tournament world it opens into. Values are
// lifted straight from the app (globals.css + lib/tournamentStatus.ts) so the
// film reads as the same product, not a lookalike.
export const C = {
  base: "#05060a", // near-black space (the app's --color-base)
  baseDeep: "#030407",

  // Hub identity
  violet: "#8b7cff",
  cyan: "#67e8f9",

  // Tournament world (warm)
  warm: "#ff8a3d", // the world's signature orange (TOURNEY.accent)
  warmSoft: "#ffab5c", // lighter warm for text on dark
  amber: "#ffb64d",
  coral: "#ff5b5b",
  gold: "#ffd166", // reserved for the champion / the final
  warmInk: "#2a1400", // dark text that holds on the warm gradient

  ink: "#f5f7ff", // off-white text
  ink2: "#8a8ab0", // secondary text

  surface: "#10131c", // card surface
  border: "#283044", // hairline border
} as const;

// The tournament banner's warm gradient, verbatim from the app.
export const WARM_GRADIENT =
  "linear-gradient(135deg, #ffb64d 0%, #ff7a3c 52%, #ff5b5b 100%)";

// Composition constants.
export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
