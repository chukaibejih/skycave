"use client";
import { memo } from "react";
import { motion } from "framer-motion";
import type { GameInfo } from "@/lib/types";

const ACCENT: Record<string, string> = {
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
};

const META: Record<string, { code: string; stat: string }> = {
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
};

// Lightweight inline glyph per game (no icon dependency).
function Glyph({ type, color }: { type: string; color: string }) {
  const common = { fill: "none", stroke: color, strokeWidth: 2 } as const;
  switch (type) {
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

// Flag a game NEW for its first few days on the hub. Set each game's go-live date
// (adjust to your actual deploy day); the badge auto-hides after NEW_DAYS.
const NEW_DAYS = 5;
const NEW_SINCE: Record<string, string> = {
  connect4: "2026-07-15",
  dots_boxes: "2026-07-15",
  clay: "2026-07-18",  // launch day
};
export function isNewGame(type: string): boolean {
  const since = NEW_SINCE[type];
  return !!since && Date.now() < new Date(since).getTime() + NEW_DAYS * 86_400_000;
}

export const GameCard = memo(function GameCard({
  game,
  onPlay,
}: {
  game: GameInfo;
  onPlay: (g: GameInfo) => void;
}) {
  const accent = ACCENT[game.type] ?? "var(--color-primary)";
  const meta = META[game.type] ?? { code: "1V1", stat: "duel" };
  const showNew = isNewGame(game.type);
  return (
    <motion.button
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onPlay(game)}
      className="group relative flex min-h-[152px] overflow-hidden rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 text-left transition-colors active:border-[color:var(--accent)] sm:min-h-[168px] sm:p-4"
      style={{ ["--accent" as string]: accent }}
    >
      <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-active:opacity-100">
        <div
          className="absolute -right-12 -top-12 h-36 w-36 rounded-full blur-3xl"
          style={{ background: accent, opacity: 0.28 }}
        />
      </div>
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--accent),transparent)] opacity-70" />

      <div className="relative flex w-full flex-col">
        <div className="flex items-start justify-between">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl border"
            style={{
              background: `${accent}18`,
              borderColor: `${accent}4d`,
              boxShadow: `0 0 22px ${accent}22`,
            }}
          >
            <Glyph type={game.type} color={accent} />
          </div>
          <div className="flex items-center gap-1.5">
            {showNew && (
              <span
                className="rounded-full px-1.5 py-0.5 font-[var(--font-mono)] text-[9px] font-bold uppercase leading-none tracking-wide"
                style={{ background: accent, color: "#05060a" }}
              >
                new
              </span>
            )}
            <span className="font-[var(--font-mono)] text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
              {meta.code}
            </span>
          </div>
        </div>

        <div className="mt-3.5 flex-1">
          <h3 className="font-[var(--font-display)] text-[15px] font-semibold leading-tight sm:text-lg">
            {game.name}
          </h3>
          <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-[var(--color-text-secondary)] sm:text-[13px]">
            {game.tagline}
          </p>
        </div>

        <div className="mt-3 flex w-full items-center justify-between gap-2">
          <span className="font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)]">
            {game.total_rounds}r / {meta.stat}
          </span>
          <span
            className="inline-flex h-8 items-center justify-center rounded-full px-4 text-[13px] font-semibold"
            style={{ background: accent, color: "#05060a" }}
          >
            Play
          </span>
        </div>
      </div>
    </motion.button>
  );
});
