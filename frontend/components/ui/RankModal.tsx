"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { Avatar } from "./Avatar";
import { getRanking, type RankingEntry } from "@/lib/api";

const rankColor = (r: number) =>
  r === 1 ? "var(--color-gold)" : r === 2 ? "var(--color-cyan)" : r === 3 ? "var(--color-warm)" : "var(--color-text-secondary)";

/**
 * The overall player ranking (1v1 wins, then total score). Opened from the RANK
 * tile on a profile; on open it fetches the list, then scrolls to and highlights
 * the profile's own player.
 */
export function RankModal({
  open,
  onClose,
  meHandle,
}: {
  open: boolean;
  onClose: () => void;
  meHandle: string;
}) {
  const [entries, setEntries] = useState<RankingEntry[] | null>(null);
  const meRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setEntries(null);
    getRanking()
      .then((r) => setEntries(r.entries))
      .catch(() => setEntries([]));
  }, [open]);

  // Once the list renders, center the current player in view.
  useEffect(() => {
    if (open && entries && meRef.current) {
      meRef.current.scrollIntoView({ block: "center" });
    }
  }, [open, entries]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[24px] border border-[var(--color-border)] bg-[var(--color-elevated)] sm:rounded-[24px]"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5">
              <h2 className="font-[var(--font-display)] text-lg font-bold">Overall ranking</h2>
              <button onClick={onClose} className="text-sm text-[var(--color-text-secondary)]">
                Close
              </button>
            </div>
            <p className="px-5 pb-3 pt-1 text-xs text-[var(--color-text-secondary)]">
              By 1v1 wins, then total score.
            </p>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(env(safe-area-inset-bottom),16px)]">
              {!entries ? (
                <p className="py-10 text-center text-sm text-[var(--color-text-secondary)]">loading...</p>
              ) : entries.length === 0 ? (
                <p className="py-10 text-center text-sm text-[var(--color-text-secondary)]">No ranked players yet.</p>
              ) : (
                <div className="space-y-1">
                  {entries.map((e) => {
                    const isMe = e.handle === meHandle;
                    return (
                      <Link
                        key={e.did}
                        ref={isMe ? meRef : undefined}
                        href={`/u/${e.handle}`}
                        onClick={onClose}
                        className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 transition-colors"
                        style={
                          isMe
                            ? {
                                background: "color-mix(in srgb, var(--color-primary) 16%, transparent)",
                                outline: "1px solid var(--color-primary)",
                              }
                            : undefined
                        }
                      >
                        <span
                          className="w-7 shrink-0 text-center font-[var(--font-display)] text-base font-bold"
                          style={{ color: rankColor(e.rank) }}
                        >
                          {e.rank}
                        </span>
                        <Avatar id={e.did} name={e.display_name ?? e.handle} avatarUrl={e.avatar_url} size={34} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{e.display_name ?? e.handle}</div>
                          <div className="truncate font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
                            @{e.handle}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="font-[var(--font-display)] text-sm font-bold">
                            {e.games_won}
                            <span className="text-[var(--color-text-secondary)]">W</span>
                          </div>
                          <div className="font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)]">
                            {e.total_score.toLocaleString()}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
