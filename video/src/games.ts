// The tournament's game pool, in draw order, mirrored from the backend
// (tournament_engine.GAME_POOL) and the app's tournament page. Accents are the
// CSS-var colours resolved to hex so the film matches the product exactly.
export type Game = {
  slug: string;
  name: string;
  tagline: string;
  accent: string;
};

export const GAMES: Game[] = [
  { slug: "tile_takeover", name: "Tile Takeover", tagline: "Flood the board. Claim the most tiles.", accent: "#56f0aa" },
  { slug: "connect4", name: "Connect 4", tagline: "Drop discs. Line up four.", accent: "#ffd166" },
  { slug: "word_hunt", name: "Word Hunt", tagline: "Trace words in the grid. Longest hunt wins.", accent: "#67e8f9" },
  { slug: "color_clash", name: "Color Clash", tagline: "Tap the ink colour, not the word.", accent: "#ff725e" },
  { slug: "mancala", name: "Mancala", tagline: "Sow the seeds. Bank the most to win.", accent: "#ffd166" },
  { slug: "clay", name: "Clay", tagline: "Shape the pot to match the target.", accent: "#ff725e" },
  { slug: "dots_boxes", name: "Dots and Boxes", tagline: "Close a box, go again. Most boxes wins.", accent: "#67e8f9" },
  { slug: "uno", name: "Uno", tagline: "Match colour or number. Empty your hand.", accent: "#8b7cff" },
];
