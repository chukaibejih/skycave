"use client";
import { AnimatePresence, motion } from "framer-motion";
import type { ConnectionStatus } from "@/lib/websocket";

const COPY: Record<ConnectionStatus, string | null> = {
  open: null, // hide when healthy
  connecting: "connecting…",
  reconnecting: "reconnecting…",
  closed: "disconnected",
};

/**
 * Slim full-width strip pinned to the very top of the screen. It overlays rather
 * than pushing the layout, so a dropped socket does not shove the lobby around.
 */
export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const text = COPY[status];
  return (
    <AnimatePresence>
      {text && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-elevated)]/95 py-1.5 text-xs text-[var(--color-text-secondary)] backdrop-blur"
        >
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-warm)]" />
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
