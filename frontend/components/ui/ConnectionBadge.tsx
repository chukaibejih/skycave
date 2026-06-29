"use client";
import { AnimatePresence, motion } from "framer-motion";
import type { ConnectionStatus } from "@/lib/websocket";

const COPY: Record<ConnectionStatus, string | null> = {
  open: null, // hide when healthy
  connecting: "connecting…",
  reconnecting: "reconnecting…",
  closed: "disconnected",
};

export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const text = COPY[status];
  return (
    <AnimatePresence>
      {text && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="fixed top-3 left-1/2 z-50 -translate-x-1/2 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-elevated)] px-4 py-1.5 text-xs text-[var(--color-text-secondary)]"
        >
          <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-warm)]" />
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
