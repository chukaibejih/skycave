"use client";
import { memo, useRef } from "react";
import { GameCard, isNewGame } from "@/components/ui/GameCard";
import { getGameCategory } from "@/components/games/gameVisual";
import type { GameInfo } from "@/lib/types";

export interface CategoryGroup {
  id: string;
  title: string;
  description: string;
  color: string;
}

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    id: "speed",
    title: "Speed & Reflex",
    description: "Rapid reaction, timing, and mental math duels",
    color: "#ff453a",
  },
  {
    id: "words",
    title: "Words & Knowledge",
    description: "Vocabulary, geography, and trivia challenges",
    color: "var(--color-cyan)",
  },
  {
    id: "strategy",
    title: "Strategy & Board",
    description: "Turn-based classics, grid capture, and tactics",
    color: "var(--color-gold)",
  },
  {
    id: "casual",
    title: "Classic & Casual",
    description: "Pick-up-and-play card and creative runs",
    color: "var(--color-warm)",
  },
];

export const ArcadeShelves = memo(function ArcadeShelves({
  games,
  onPlay,
}: {
  games: GameInfo[];
  onPlay: (game: GameInfo) => void;
}) {
  return (
    <div className="space-y-10">
      {CATEGORY_GROUPS.map((group) => {
        // Group games using backend category with fallback helper
        const groupGames = games.filter(
          (g) => getGameCategory(g) === group.id
        );

        if (groupGames.length === 0) return null;

        // NEW games float to the first card in their category shelf
        const sortedGames = [...groupGames].sort((a, b) => {
          const aNew = isNewGame(a.type) ? 1 : 0;
          const bNew = isNewGame(b.type) ? 1 : 0;
          return bNew - aNew;
        });

        return (
          <ShelfRow
            key={group.id}
            group={group}
            games={sortedGames}
            onPlay={onPlay}
          />
        );
      })}
    </div>
  );
});

function ShelfRow({
  group,
  games,
  onPlay,
}: {
  group: CategoryGroup;
  games: GameInfo[];
  onPlay: (game: GameInfo) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = direction === "left" ? -300 : 300;
    scrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
  };

  return (
    <div className="group/shelf relative">
      {/* Subtle ambient glow behind shelf header */}
      <div
        className="pointer-events-none absolute -left-6 top-0 -z-10 h-28 w-28 rounded-full opacity-10 blur-2xl transition-opacity group-hover/shelf:opacity-20"
        style={{ background: group.color }}
      />

      {/* Category header */}
      <div className="mb-3 flex items-end justify-between px-1">
        <div>
          <div className="flex items-center gap-2.5">
            <div
              className="h-4 w-1.5 rounded-full"
              style={{
                background: group.color,
                boxShadow: `0 0 12px ${group.color}`,
              }}
            />
            <h3 className="font-[var(--font-display)] text-lg font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-xl">
              {group.title}
            </h3>
            <span
              className="rounded-full border px-2 py-0.5 font-[var(--font-mono)] text-[10px] font-semibold"
              style={{
                borderColor: `${group.color}40`,
                color: group.color,
                background: `${group.color}14`,
              }}
            >
              {games.length}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[var(--color-text-secondary)] pl-4">
            {group.description}
          </p>
        </div>

        {/* Scroll indicator arrows for desktop */}
        <div className="hidden gap-1 sm:flex">
          <button
            onClick={() => scroll("left")}
            aria-label={`Scroll ${group.title} left`}
            className="grid h-7 w-7 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/70 text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-white"
          >
            ‹
          </button>
          <button
            onClick={() => scroll("right")}
            aria-label={`Scroll ${group.title} right`}
            className="grid h-7 w-7 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/70 text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-white"
          >
            ›
          </button>
        </div>
      </div>

      {/* Horizontal scroll track */}
      <div
        ref={scrollRef}
        className="flex w-full snap-x snap-mandatory gap-3.5 overflow-x-auto pb-2 pt-1 scrollbar-none sm:gap-4"
        style={{ scrollBehavior: "smooth" }}
      >
        {games.map((game) => (
          <div
            key={game.type}
            className="h-[172px] w-[250px] shrink-0 snap-start sm:h-[184px] sm:w-[270px]"
          >
            <GameCard game={game} onPlay={onPlay} />
          </div>
        ))}
      </div>
    </div>
  );
}
