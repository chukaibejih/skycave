"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { BackButton } from "@/components/nav/BackButton";
import { TOURNEY } from "@/lib/tournamentStatus";

/**
 * The frame every page in the Tournament world sits inside.
 *
 * It carries the world switch (Tournament lit) and the sub-navigation between
 * the world's four rooms, so a player always knows they are inside the
 * tournament and can move between its parts without going back to the hub. The
 * live event is the hero the sub-nav opens on; the rest of the world is one tap
 * away and no further.
 */
export type TournamentTab = "now" | "past" | "rules" | "record";

// Short labels so all four fit across a 390px screen without the last one
// being clipped at the edge. In the tournament world the context is clear:
// "Past" is past weeks, "Record" is your record.
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
  return (
    <main
      className={`mx-auto min-h-[100dvh] w-full px-5 pb-16 pt-6 ${wide ? "max-w-5xl" : "max-w-lg"}`}
    >
      <BackButton href="/" label="Hub" />

      {/* The world's own rooms, as an underline tab bar: text tabs on a shared
          baseline, the active one carrying a warm underline. The bar stays at
          content width so its baseline lines up with the back button and the
          page below on both edges; it scrolls within that width rather than
          bleeding past the content. */}
      <nav
        className="mt-4 overflow-x-auto border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="flex w-max gap-7">
          {TABS.map((t) => {
            const on = t.key === active;
            return (
              <Link
                key={t.key}
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

      <div className="mt-7">{children}</div>
    </main>
  );
}
