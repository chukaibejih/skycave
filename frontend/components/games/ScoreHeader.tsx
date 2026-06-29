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
}: Props) {
  const p1 = players[0];
  const p2 = players[1];

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
