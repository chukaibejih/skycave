"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { TOURNEY } from "@/lib/tournamentStatus";

/**
 * The frame every page in the Tournament world sits inside.
 *
 * A single header row: a light "back to Hub" on the left and the world's four
 * rooms as an underline tab bar sharing one baseline, so the header reads as one
 * thing rather than a heavy pill stacked over a row of tabs. The active tab is
 * scrolled into view, so on a narrow screen the rightmost tab is never stranded
 * off-edge.
 */
export type TournamentTab = "now" | "past" | "rules" | "record";

// Short labels so the back link and all four tabs share one 390px line. In the
// tournament world the context is clear: "Past" is past weeks, "Record" yours.
const TABS: { key: TournamentTab; label: string; href: string }[] = [
  { key: "now", label: "This weekend", href: "/tournament" },
  { key: "past", label: "Past", href: "/tournament/past" },
  { key: "rules", label: "Rules", href: "/tournament/rules" },
  { key: "record", label: "Record", href: "/tournament/me" },
];

export function TournamentShell({
  active,
  children,
  wide = false,
}: {
  active: TournamentTab;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const activeRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    // Bring the current tab into the scroll viewport without nudging the page.
    activeRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [active]);

  return (
    <main
      className={`mx-auto min-h-[100dvh] w-full px-4 pb-16 pt-5 ${wide ? "max-w-5xl" : "max-w-lg"}`}
    >
      {/* One header row: back on the left, tabs sharing the same baseline and
          bottom border. The back link never scrolls; the tabs scroll past it if
          the screen is too narrow to hold all four. */}
      <div
        className="flex items-end gap-3 border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        <Link
          href="/"
          className="flex shrink-0 items-center gap-1 pb-3 text-[13px] text-[var(--color-text-secondary)] transition-colors active:text-[var(--color-text-primary)]"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Hub
        </Link>

        <nav className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex w-max gap-5 pl-1">
            {TABS.map((t) => {
              const on = t.key === active;
              return (
                <Link
                  key={t.key}
                  ref={on ? activeRef : undefined}
                  href={t.href}
                  className="relative whitespace-nowrap pb-3 pt-1 text-sm font-semibold transition-colors"
                  style={{ color: on ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}
                >
                  {t.label}
                  {on && (
                    <motion.span
                      layoutId="tournament-tab"
                      className="absolute inset-x-0 -bottom-px h-[3px] rounded-full"
                      style={{ background: TOURNEY.accent }}
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>

      <div className="mt-7">{children}</div>
    </main>
  );
}
