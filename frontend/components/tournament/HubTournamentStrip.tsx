"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Countdown } from "@/components/tournament/Countdown";
import { useTournamentSignal } from "@/lib/useTournamentSignal";

/**
 * The tournament's only presence on the hub, and only when it earns one.
 *
 * The hub stays clean all week by design - the tournament is a world you go to,
 * not chrome that follows you home. The one exception is the closing hours: in
 * the final stretch before entries shut, a slim strip appears to pull hub-only
 * players across at the moment it actually matters, and it is silent every other
 * day. It also lights up for a player whose own match is waiting, because that
 * is the one thing worth interrupting the hub for.
 */
const CLOSING_WINDOW_MS = 24 * 60 * 60 * 1000; // the final day

export function HubTournamentStrip() {
  const { tournament, livePip, closesInMs } = useTournamentSignal();
  if (!tournament) return null;

  const closingSoon =
    tournament.status === "registering" &&
    closesInMs !== null &&
    closesInMs <= CLOSING_WINDOW_MS;

  // Your match waiting outranks everything; then the closing bell; otherwise the
  // hub shows nothing, which is the whole point.
  let body: React.ReactNode = null;
  let accent = "var(--color-cyan)";
  let href = "/tournament";

  if (livePip) {
    href = `/tournament/${tournament.id}/match`;
    body = <span className="font-semibold">Your tournament match is waiting</span>;
  } else if (closingSoon) {
    accent = "var(--color-primary)";
    body = (
      <span className="flex flex-wrap items-center gap-x-1.5">
        <span className="font-semibold">Weekend tournament closes in</span>
        <Countdown to={tournament.registration_closes_at} compact />
        {tournament.spots_left > 0 && (
          <span className="text-[var(--color-text-secondary)]">
            · {tournament.spots_left} {tournament.spots_left === 1 ? "spot" : "spots"} left
          </span>
        )}
      </span>
    );
  } else {
    return null;
  }

  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
      <Link
        href={href}
        className="flex items-center gap-3 rounded-[14px] border px-4 py-2.5 text-sm transition-[filter] active:brightness-110"
        style={{
          borderColor: `color-mix(in srgb, ${accent} 45%, transparent)`,
          background: `linear-gradient(90deg, color-mix(in srgb, ${accent} 12%, transparent), transparent 70%), var(--color-surface)`,
        }}
      >
        <motion.span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
        <span className="min-w-0 flex-1">{body}</span>
        <span aria-hidden style={{ color: accent }}>
          →
        </span>
      </Link>
    </motion.div>
  );
}
