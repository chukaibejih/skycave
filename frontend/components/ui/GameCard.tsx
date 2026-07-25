"use client";
import { memo } from "react";
import { motion } from "framer-motion";
import type { GameInfo } from "@/lib/types";
import { GAME_ACCENT, GAME_META, GameGlyph } from "@/components/games/gameVisual";

// Flag a game NEW for its first few days on the hub. Set each game's go-live date
// (adjust to your actual deploy day); the badge auto-hides after NEW_DAYS.
const NEW_DAYS = 5;
const NEW_SINCE: Record<string, string> = {
  connect4: "2026-07-15",
  dots_boxes: "2026-07-15",
  clay: "2026-07-18",  // launch day
  uno: "2026-07-22",   // launch day - move this if the merge slips
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
  const accent = GAME_ACCENT[game.type] ?? "var(--color-primary)";
  const meta = GAME_META[game.type] ?? { code: "1V1", stat: "duel" };
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
            <GameGlyph type={game.type} color={accent} />
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
