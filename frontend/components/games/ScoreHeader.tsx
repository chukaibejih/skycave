"use client";
import { motion } from "framer-motion";
import type { PlayerSlot } from "@/lib/types";
import { RoundTimer } from "./RoundTimer";

interface Props {
  players: PlayerSlot[];
  scores: Record<string, number>;
  meId?: string;
  round: number;
  totalRounds: number;
  endsAt?: number | null;
  durationSec?: number;
  active?: boolean;
  showRounds?: boolean;
}

// Minimal in-game chrome: P1 vs P2 score + round indicator + countdown (spec §7).
export function ScoreHeader({
  players,
  scores,
  meId,
  round,
  totalRounds,
  endsAt = null,
  durationSec = 0,
  active = false,
  showRounds = true,
}: Props) {
  const p1 = players[0];
  const p2 = players[1];
  const solo = players.length === 1;

  const Side = ({
    player,
    accent,
    align,
  }: {
    player?: PlayerSlot;
    accent: string;
    align: "left" | "right";
  }) => (
    <div className={align === "right" ? "min-w-0 text-right" : "min-w-0 text-left"}>
      <div className="truncate text-xs text-[var(--color-text-secondary)]">
        {player ? (player.id === meId ? "you" : player.display_name) : "-"}
      </div>
      <motion.div
        key={player ? scores[player.id] ?? 0 : 0}
        initial={{ scale: 1 }}
        animate={{ scale: [1.3, 1] }}
        transition={{ duration: 0.3 }}
        className="font-[var(--font-display)] text-3xl font-semibold"
        style={{ color: accent }}
      >
        {player ? scores[player.id] ?? 0 : 0}
      </motion.div>
    </div>
  );

  if (solo) {
    // Solo HUD: one centered cluster (timer + score), no P1/P2 flanking that
    // would imply a missing opponent.
    return (
      <div className="relative z-10 mx-auto mt-[max(env(safe-area-inset-top),12px)] flex w-fit items-center gap-4 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/70 py-2.5 pl-3 pr-6 backdrop-blur-md">
        <div className="flex flex-col items-center gap-0.5">
          <RoundTimer endsAt={endsAt} durationSec={durationSec} active={active} />
          {showRounds && (
            <div className="font-[var(--font-mono)] text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
              {round}/{totalRounds}
            </div>
          )}
        </div>
        <div className="text-left">
          <div className="font-[var(--font-mono)] text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
            score
          </div>
          <motion.div
            key={p1 ? scores[p1.id] ?? 0 : 0}
            initial={{ scale: 1 }}
            animate={{ scale: [1.25, 1] }}
            transition={{ duration: 0.3 }}
            className="font-[var(--font-display)] text-3xl font-semibold leading-none text-[var(--color-primary)]"
          >
            {p1 ? scores[p1.id] ?? 0 : 0}
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10 mx-auto mt-[max(env(safe-area-inset-top),12px)] flex w-[calc(100%-24px)] max-w-3xl items-center justify-between gap-3 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-4 py-3 backdrop-blur-md">
      <Side player={p1} accent="var(--color-primary)" align="left" />
      <div className="flex flex-col items-center gap-0.5">
        <RoundTimer endsAt={endsAt} durationSec={durationSec} active={active} />
        <div className="font-[var(--font-mono)] text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
          {round}/{totalRounds}
        </div>
      </div>
      <Side player={p2} accent="var(--color-warm)" align="right" />
    </div>
  );
}
