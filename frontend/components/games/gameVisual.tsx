"use client";
// Shared game visuals: one accent colour, one glyph, and one code/stat per game.
// Both the hub's GameCard and the tournament's game cards draw from here, so a
// game looks like itself everywhere it appears.

export const GAME_ACCENT: Record<string, string> = {
  geoguess: "var(--color-primary)",
  color_clash: "var(--color-warm)",
  flag_rush: "var(--color-success)",
  outline_quiz: "var(--color-cyan)",
  word_duel: "var(--color-gold)",
  reaction_grid: "var(--color-primary)",
  mad_math: "var(--color-gold)",
  word_hunt: "var(--color-cyan)",
  tile_takeover: "var(--color-success)",
  connect4: "var(--color-gold)",
  dots_boxes: "var(--color-cyan)",
  clay: "var(--color-warm)",
  uno: "var(--color-primary)",
  mancala: "var(--color-gold)",
  crossing: "var(--color-primary)",
  freeze: "var(--color-cyan)",
};

export const GAME_META: Record<string, { code: string; stat: string }> = {
  geoguess: { code: "GEO", stat: "3D globe" },
  color_clash: { code: "CLR", stat: "reflex" },
  uno: { code: "UNO", stat: "cards" },
  flag_rush: { code: "FLG", stat: "speed" },
  outline_quiz: { code: "OUT", stat: "shapes" },
  word_duel: { code: "WRD", stat: "vocab" },
  reaction_grid: { code: "RXN", stat: "memory" },
  mad_math: { code: "MTH", stat: "mental" },
  word_hunt: { code: "HNT", stat: "grid" },
  tile_takeover: { code: "TKO", stat: "board" },
  connect4: { code: "C4", stat: "4 in a row" },
  dots_boxes: { code: "D&B", stat: "boxes" },
  clay: { code: "CLY", stat: "pottery" },
  mancala: { code: "MNC", stat: "seeds" },
  crossing: { code: "CRX", stat: "race" },
  freeze: { code: "FRZ", stat: "timing" },
};

export const GAME_CATEGORY: Record<string, string> = {
  flag_rush: "speed",
  reaction_grid: "speed",
  color_clash: "speed",
  mad_math: "speed",
  freeze: "speed",
  word_duel: "words",
  word_hunt: "words",
  outline_quiz: "words",
  geoguess: "words",
  connect4: "strategy",
  mancala: "strategy",
  dots_boxes: "strategy",
  tile_takeover: "strategy",
  uno: "casual",
  clay: "casual",
  crossing: "casual",
};

export function getGameCategory(game: { type: string; category?: string }): string {
  return game.category ?? GAME_CATEGORY[game.type] ?? "casual";
}

// Lightweight inline glyph per game (no icon dependency).
export function GameGlyph({ type, color }: { type: string; color: string }) {
  const common = { fill: "none", stroke: color, strokeWidth: 2 } as const;
  switch (type) {
    case "crossing":
      // two three-tooth forks racing toward the middle: your three pieces (solid)
      // funnel across to the far fork (hollow) - the board itself, in miniature.
      return (
        <svg width="34" height="34" viewBox="0 0 24 24" {...common} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 5l5.5 7L5 19M5 12h5.5" />
          <path d="M19 5l-5.5 7L19 19M19 12h-5.5" />
          <path d="M10.5 12h3" />
          <circle cx="5" cy="5" r="1.7" fill={color} />
          <circle cx="5" cy="12" r="1.7" fill={color} />
          <circle cx="5" cy="19" r="1.7" fill={color} />
          <circle cx="19" cy="5" r="1.7" />
          <circle cx="19" cy="12" r="1.7" />
          <circle cx="19" cy="19" r="1.7" />
        </svg>
      );
    case "freeze":
      // a marker (solid bar) sliding a rail toward a target zone - the game in
      // miniature: stop it as close to the middle as you can.
      return (
        <svg width="34" height="34" viewBox="0 0 24 24" {...common} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12h18" />
          <rect x="13.5" y="7.5" width="5" height="9" rx="1.2" />
          <path d="M7 6.5V17.5" strokeWidth="2.6" />
        </svg>
      );
    case "geoguess":
      return (
        <svg width="34" height="34" viewBox="0 0 24 24" {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
        </svg>
      );
    case "color_clash":
      return (
        <svg width="34" height="34" viewBox="0 0 24 24" {...common}>
          <circle cx="9" cy="9" r="5" />
          <circle cx="15" cy="15" r="5" />
        </svg>
      );
    case "outline_quiz":
      return (
        <svg width="34" height="34" viewBox="0 0 24 24" {...common}>
          <path
            d="M7 4l4 2 5-2 1 4-2 3 2 4-4 3-5-1-3-4 2-4-1-4z"
            fill={color}
            fillOpacity="0.2"
          />
        </svg>
      );
    case "word_duel":
      return (
        <svg width="34" height="34" viewBox="0 0 24 24" {...common}>
          <rect x="3" y="6" width="8" height="8" rx="1.5" />
          <rect x="13" y="10" width="8" height="8" rx="1.5" />
        </svg>
      );
    case "reaction_grid":
      return (
        <svg width="34" height="34" viewBox="0 0 24 24" stroke={color} strokeWidth={2}>
          {[6, 12, 18].map((y) =>
            [6, 12, 18].map((x) => (
              <circle
                key={`${x}-${y}`}
                cx={x}
                cy={y}
                r="1.6"
                fill={x === 12 && y === 6 ? color : "none"}
              />
            ))
          )}
        </svg>
      );
    case "mad_math":
      // operator cluster: a plus and a multiply
      return (
        <svg width="34" height="34" viewBox="0 0 24 24" {...common} strokeLinecap="round">
          <path d="M5 8h6M8 5v6" />
          <path d="M14 14l5 5M19 14l-5 5" />
        </svg>
      );
    case "word_hunt":
      // a grid with a traced hunt path
      return (
        <svg width="34" height="34" viewBox="0 0 24 24" {...common} strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2.5" />
          <path d="M8 9l3 3 2-2 3 4" fill="none" />
        </svg>
      );
    case "dots_boxes":
      // four dots with two closed sides
      return (
        <svg width="34" height="34" viewBox="0 0 24 24" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round">
          <path d="M7 7h10M7 7v10" />
          {[7, 17].map((x) => [7, 17].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill={color} stroke="none" />))}
        </svg>
      );
    case "connect4":
      // a board with dropped discs
      return (
        <svg width="34" height="34" viewBox="0 0 24 24" stroke={color} strokeWidth={1.8} fill="none">
          <rect x="4" y="4" width="16" height="16" rx="2.5" />
          <circle cx="9" cy="15" r="1.9" fill={color} />
          <circle cx="15" cy="15" r="1.9" fill={color} fillOpacity="0.35" />
          <circle cx="9" cy="9.5" r="1.9" fill={color} fillOpacity="0.35" />
        </svg>
      );
    case "tile_takeover":
      // a 2x2 board, two tiles claimed
      return (
        <svg width="34" height="34" viewBox="0 0 24 24" stroke={color} strokeWidth={1.8} fill="none">
          <rect x="4" y="4" width="7" height="7" rx="1.4" fill={color} fillOpacity="0.4" />
          <rect x="13" y="4" width="7" height="7" rx="1.4" />
          <rect x="4" y="13" width="7" height="7" rx="1.4" />
          <rect x="13" y="13" width="7" height="7" rx="1.4" fill={color} fillOpacity="0.4" />
        </svg>
      );
    case "uno":
      // two fanned cards in Uno's own colours
      return (
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
          <g transform="rotate(-16 12 20)">
            <rect x="4.5" y="5" width="9.5" height="14" rx="2" fill="#ff5a4e" />
            <rect x="4.5" y="5" width="9.5" height="14" rx="2" stroke="#05060a" strokeWidth="1.1" />
          </g>
          <g transform="rotate(14 12 20)">
            <rect x="10.5" y="5" width="9.5" height="14" rx="2" fill="#4a90ff" />
            <rect x="10.5" y="5" width="9.5" height="14" rx="2" stroke="#05060a" strokeWidth="1.1" />
            <path d="M13.2 9.4h4.2" stroke="#f5f7ff" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M13.2 12h4.2" stroke="#ffd166" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M13.2 14.6h4.2" stroke="#3fce7c" strokeWidth="1.5" strokeLinecap="round" />
          </g>
        </svg>
      );
    case "clay":
      // a vase on the wheel
      return (
        <svg width="34" height="34" viewBox="0 0 24 24" stroke={color} strokeWidth={1.8} fill="none" strokeLinejoin="round">
          <path d="M9 4h6" />
          <path d="M9 4c0 2-2 3-2 6s2 4 2 5c-3 1-4 2-4 3.5 0 0 3 1.5 7 1.5s7-1.5 7-1.5c0-1.5-1-2.5-4-3.5 0-1 2-2 2-5s-2-4-2-6" fill={color} fillOpacity="0.22" />
        </svg>
      );
    case "mancala":
      // a board: a store on the right and two rows of seed pits
      return (
        <svg width="34" height="34" viewBox="0 0 24 24" stroke={color} strokeWidth={1.6} fill="none">
          <rect x="2.5" y="6" width="13" height="12" rx="3" />
          <rect x="17" y="4.5" width="4.5" height="15" rx="2.2" fill={color} fillOpacity="0.25" />
          {[6, 10, 13].map((cx) => (
            <g key={cx}>
              <circle cx={cx} cy="10" r="1.5" fill={color} stroke="none" />
              <circle cx={cx} cy="14" r="1.5" fill={color} stroke="none" />
            </g>
          ))}
        </svg>
      );
    default:
      // flag_rush
      return (
        <svg width="34" height="34" viewBox="0 0 24 24" {...common}>
          <path d="M5 3v18" />
          <path d="M5 4h13l-3 4 3 4H5" fill={color} fillOpacity="0.25" />
        </svg>
      );
  }
}
