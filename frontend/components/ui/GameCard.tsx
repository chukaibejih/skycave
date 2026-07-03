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
};

const META: Record<string, { code: string; stat: string }> = {
  geoguess: { code: "GEO", stat: "3D globe" },
  color_clash: { code: "CLR", stat: "reflex" },
  flag_rush: { code: "FLG", stat: "speed" },
  outline_quiz: { code: "OUT", stat: "shapes" },
  word_duel: { code: "WRD", stat: "vocab" },
  reaction_grid: { code: "RXN", stat: "memory" },
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

export const GameCard = memo(function GameCard({
  game,
  onPlay,
}: {
  game: GameInfo;
  onPlay: (g: GameInfo) => void;
}) {
  const accent = ACCENT[game.type] ?? "var(--color-primary)";
  const meta = META[game.type] ?? { code: "1V1", stat: "duel" };
  return (
    <motion.button
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onPlay(game)}
      className="group relative flex min-h-[220px] overflow-hidden rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition-colors active:border-[color:var(--accent)]"
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
            className="flex h-14 w-14 items-center justify-center rounded-2xl border"
            style={{
              background: `${accent}18`,
              borderColor: `${accent}4d`,
              boxShadow: `0 0 26px ${accent}26`,
            }}
          >
            <Glyph type={game.type} color={accent} />
          </div>
          <span className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
            {meta.code}
          </span>
        </div>

        <div className="mt-8 flex-1">
          <h3 className="font-[var(--font-display)] text-xl font-semibold leading-tight">
            {game.name}
          </h3>
          <p className="mt-2 text-sm leading-snug text-[var(--color-text-secondary)]">
            {game.tagline}
          </p>
        </div>

        <div className="mt-7 flex w-full items-center justify-between gap-3">
          <span className="font-[var(--font-mono)] text-[11px] text-[var(--color-text-secondary)]">
            {game.total_rounds} rounds / {meta.stat}
          </span>
          <span
            className="inline-flex h-10 min-w-20 items-center justify-center rounded-full px-4 text-sm font-semibold"
            style={{ background: accent, color: "#05060a" }}
          >
            Play
          </span>
        </div>
      </div>
    </motion.button>
  );
});
