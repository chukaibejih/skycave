"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { useTournamentSignal } from "@/lib/useTournamentSignal";

/**
 * The spine between Skycave's two worlds.
 *
 * Hub is the front door and stays the home everyone lands on; Tournament is a
 * world of its own that stands up between events. This switch sits in the same
 * place in both and only flips which side is lit, so it reads as one piece of
 * navigation rather than two separate navbars. It behaves as links between
 * destinations, not a toggle of one page's contents.
 *
 * The Tournament side wears a small cyan pip when the signed-in player has a
 * fixture waiting - the single urgent thing a plain label cannot say, folded
 * back into the switch so world-parity never costs "your match is live".
 */
export function WorldSwitch({ active }: { active: "hub" | "tournament" }) {
  const { livePip } = useTournamentSignal();

  return (
    <div
      className="inline-flex items-center rounded-full border p-0.5"
      style={{
        borderColor: "var(--color-border)",
        background: "color-mix(in srgb, var(--color-surface) 70%, transparent)",
      }}
    >
      <Side href="/" label="Hub" active={active === "hub"} />
      <Side
        href="/tournament"
        label="Tournament"
        active={active === "tournament"}
        pip={livePip}
      />
    </div>
  );
}

function Side({
  href,
  label,
  active,
  pip,
}: {
  href: string;
  label: string;
  active: boolean;
  pip?: boolean;
}) {
  return (
    <Link
      href={href}
      className="relative rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors sm:px-4"
      style={{ color: active ? "#05060a" : "var(--color-text-secondary)" }}
    >
      {/* The lit background rides between the two sides with layout animation,
          so switching worlds slides rather than cuts. */}
      {active && (
        <motion.span
          layoutId="world-switch-lit"
          aria-hidden
          className="absolute inset-0 rounded-full"
          // Sits above the track's own fill but below the label (which is
          // position:relative, so it paints on top). A negative z-index would
          // drop it behind the track and make the active side look disabled.
          style={{ background: "var(--color-primary)", zIndex: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
      <span className="relative">{label}</span>
      {pip && (
        <motion.span
          aria-label="your match is waiting"
          className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full"
          style={{ background: "var(--color-cyan)", boxShadow: "0 0 8px var(--color-cyan)" }}
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
    </Link>
  );
}
