// Display names for game types (the API mostly carries the type, not the name).
export const GAME_NAME: Record<string, string> = {
  geoguess: "GeoGuess 1v1",
  color_clash: "Color Clash",
  flag_rush: "Flag Rush",
  outline_quiz: "Outline Quiz",
  word_duel: "Word Duel",
  reaction_grid: "Reaction Grid",
  mad_math: "Mad Math",
  word_hunt: "Word Hunt",
  tile_takeover: "Tile Takeover",
  connect4: "Connect 4",
  dots_boxes: "Dots and Boxes",
  clay: "Clay",
  uno: "Uno",
};
export const gameName = (t: string) => GAME_NAME[t] ?? t;

// A game name for solo / mode-agnostic contexts. Some names bake in a mode
// (e.g. "GeoGuess 1v1"), which reads wrong on a solo run, so trim a trailing 1v1.
export const soloName = (name: string) => name.replace(/\s*1v1$/i, "");
