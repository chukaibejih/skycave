"use client";
import { motion } from "framer-motion";
import { Avatar } from "@/components/ui/Avatar";
import type { PlayerSlot } from "@/lib/types";

interface Props {
  player: PlayerSlot | null;
  accent?: "primary" | "warm";
  label?: string;
}

export function PlayerCard({ player, accent = "primary", label }: Props) {
  const color =
    accent === "warm" ? "var(--color-warm)" : "var(--color-primary)";

  if (!player) {
    return (
      <motion.div
        animate={{ opacity: [0.55, 1, 0.55] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        className="flex min-h-[96px] flex-1 items-center justify-center rounded-[20px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/35 px-4 py-3 text-sm text-[var(--color-text-secondary)]"
      >
        waiting for opponent...
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="panel flex min-h-[96px] flex-1 items-center gap-3 rounded-[20px] px-4 py-3"
      style={{ borderColor: `${color}55` }}
    >
      <div className="relative">
        <Avatar
          id={player.id}
          name={player.display_name}
          avatarUrl={player.avatar_url}
          size={48}
        />
        <span
          className="absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border-2 border-[var(--color-surface)]"
          style={{
            background: player.connected
              ? "var(--color-success)"
              : "var(--color-text-secondary)",
          }}
          title={player.connected ? "connected" : "disconnected"}
        />
      </div>
      <div className="min-w-0">
        {label && (
          <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
            {label}
          </div>
        )}
        <div className="truncate font-[var(--font-display)] text-lg font-semibold">
          {player.display_name}
        </div>
        <div className="truncate font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
          {player.is_guest ? "guest" : `@${player.handle}`}
          {player.ready && " / ready"}
        </div>
      </div>
    </motion.div>
  );
}
