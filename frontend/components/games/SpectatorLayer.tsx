"use client";
import { motion } from "framer-motion";
import { useRoom } from "@/lib/store";

/**
 * The watch layer that sits over any live game, for players and spectators
 * alike: an eye + count of who's watching, and emoji reactions that float up
 * and fade. Fixed-position so it works regardless of which game board is
 * mounted (some early-return before GameShell's container). Reactions are
 * driven by the store's capped list; each floats once, keyed by id.
 */
export function SpectatorLayer() {
  const count = useRoom((s) => s.spectatorCount);
  const reactions = useRoom((s) => s.reactions);

  return (
    <>
      {count > 0 && (
        <div className="fixed bottom-4 left-4 z-40 flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/80 px-3 py-1.5 backdrop-blur-md">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span className="font-[var(--font-mono)] text-xs tabular-nums text-[var(--color-text-primary)]">
            {count}
          </span>
        </div>
      )}

      <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
        {reactions.map((r) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 0, scale: 0.6 }}
            animate={{ opacity: [0, 1, 1, 0], y: -260, scale: 1 }}
            transition={{ duration: 2.8, ease: "easeOut", times: [0, 0.1, 0.7, 1] }}
            className="absolute text-4xl"
            style={{ left: `${((r.id * 37) % 74) + 13}%`, bottom: 90 }}
          >
            {r.emoji}
          </motion.div>
        ))}
      </div>
    </>
  );
}
