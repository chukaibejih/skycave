// Fonts load through @remotion/google-fonts, which injects the @font-face rules
// and registers a delayRender so the renderer waits for the glyphs before it
// captures a frame. Display / body / mono mirror the app's typographic roles.
import { loadFont as loadDisplay } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadBody } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

export const display = loadDisplay("normal", {
  weights: ["500", "700"],
  subsets: ["latin"],
}).fontFamily;

export const body = loadBody("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin"],
}).fontFamily;

export const mono = loadMono("normal", {
  weights: ["400", "500"],
  subsets: ["latin"],
}).fontFamily;
