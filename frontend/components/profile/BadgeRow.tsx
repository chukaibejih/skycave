"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface Badge {
  key: string;
  label: string;
  detail: string;
}

/**
 * Profile badges you can actually ask about.
 *
 * The explanation used to live in a `title` attribute, which never fires on a
 * touch device, so on a mobile-first product the meaning of every badge was
 * effectively hidden. Each badge is now a button that opens a small panel
 * naming what it took to earn it.
 *
 * The panel sits under the row rather than floating beside the badge on
 * purpose: badges wrap onto several lines and an anchored popover would clip
 * off the edge of a narrow screen. The active badge stays highlighted, so it is
 * still obvious which one is being explained.
 */
export function BadgeRow({ badges }: { badges: Badge[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = badges.find((b) => b.key === openKey) ?? null;

  if (badges.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {badges.map((b) => {
          const active = b.key === openKey;
          return (
            <button
              key={b.key}
              type="button"
              aria-expanded={active}
              aria-label={`${b.label}: what this means`}
              onClick={() => setOpenKey(active ? null : b.key)}
              className="rounded-full border px-3 py-1 text-xs font-medium transition-[background,filter] active:brightness-110"
              style={{
                borderColor: "var(--color-primary)",
                color: active ? "#05060a" : "var(--color-text-primary)",
                background: active
                  ? "var(--color-primary)"
                  : "color-mix(in srgb, var(--color-primary) 12%, transparent)",
              }}
            >
              {b.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key={open.key}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="mt-2.5 rounded-[12px] border px-3.5 py-3"
            style={{
              borderColor: "color-mix(in srgb, var(--color-primary) 40%, transparent)",
              background: "var(--color-surface)",
            }}
          >
            <div className="text-sm font-semibold">{open.label}</div>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-secondary)]">
              {open.detail}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
