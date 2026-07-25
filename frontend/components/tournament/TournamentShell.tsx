"use client";
import Link from "next/link";
import { WorldSwitch } from "@/components/nav/WorldSwitch";

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

const TABS: { key: TournamentTab; label: string; href: string }[] = [
  { key: "now", label: "This weekend", href: "/tournament" },
  { key: "past", label: "Past weeks", href: "/tournament/past" },
  { key: "rules", label: "Rulebook", href: "/tournament/rules" },
  { key: "record", label: "Your record", href: "/tournament/me" },
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
      <div className="flex items-center justify-between gap-3">
        <WorldSwitch active="tournament" />
      </div>

      {/* The world's own rooms. Scrolls on its own on a narrow screen rather
          than wrapping into a second line that pushes the content down. */}
      <nav className="mt-5 -mx-5 overflow-x-auto px-5">
        <div className="flex w-max gap-2">
          {TABS.map((t) => {
            const on = t.key === active;
            return (
              <Link
                key={t.key}
                href={t.href}
                className="whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors"
                style={{
                  borderColor: on
                    ? "color-mix(in srgb, var(--color-primary) 55%, transparent)"
                    : "var(--color-border)",
                  background: on
                    ? "color-mix(in srgb, var(--color-primary) 14%, transparent)"
                    : "transparent",
                  color: on ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                }}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="mt-7">{children}</div>
    </main>
  );
}
