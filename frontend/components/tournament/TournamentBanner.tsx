"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Countdown } from "@/components/tournament/Countdown";
import { statusMeta } from "@/lib/tournamentStatus";
import { useTournamentSignal } from "@/lib/useTournamentSignal";

/**
 * The tournament's entry point on the hub, built to feel like match day rather
 * than a menu item.
 *
 * It is deliberately the one warm thing on a cool, dark page: amber into deep
 * orange, so it lifts off the surface instead of sitting in the list. It answers
 * the three questions at a glance without reading - what is happening (the
 * status), what to do (one button), how long (the countdown when time is what
 * matters) - and it is the only way into the tournament world, which is why the
 * old Hub/Tournament toggle is gone.
 */
const WARM = "linear-gradient(135deg, #ffb64d 0%, #ff7a3c 52%, #ff5b5b 100%)";
const INK = "#2a1400"; // dark text that holds contrast on amber

export function TournamentBanner() {
  const { tournament: t, livePip } = useTournamentSignal();
  if (!t) return null;

  const s = statusMeta(t);
  const href = s.phase === "finished" ? `/tournament/${t.id}` : "/tournament";
  const spots =
    s.phase === "open" && t.spots_left > 0
      ? `${t.spots_left} ${t.spots_left === 1 ? "spot" : "spots"} left`
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 24 }}
    >
      <Link href={href} className="block">
        <div
          className="relative overflow-hidden rounded-[22px] p-5 sm:p-6"
          style={{ background: WARM, boxShadow: "0 14px 40px rgba(255, 110, 60, 0.28)" }}
        >
          {/* A slow drift of light across the card, so it reads as alive. */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -top-16 right-0 h-56 w-56 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.35), transparent 65%)" }}
            animate={{ x: [-10, 24, -10], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          />

          <div className="relative">
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.2em]"
                style={{ background: "rgba(0,0,0,0.18)", color: INK }}
              >
                {(s.phase === "live" || s.phase === "finals") && (
                  <motion.span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: INK }}
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1.3, repeat: Infinity }}
                  />
                )}
                Weekend event
              </span>
            </div>

            <h2
              className="mt-2.5 font-[var(--font-display)] text-2xl font-bold leading-[1.05] sm:text-3xl"
              style={{ color: INK }}
            >
              {t.name}
            </h2>

            <p className="mt-1 text-sm font-semibold" style={{ color: "rgba(42,20,0,0.78)" }}>
              {s.label}
              {spots && ` · ${spots}`}
            </p>

            {/* When time is the point, make it loud - dark scoreboard chips that
                pop against the amber rather than a line of small text. */}
            {s.countdownTo && (
              <div className="mt-4">
                <div
                  className="inline-flex rounded-[14px] px-3 py-2"
                  style={{ background: "rgba(0,0,0,0.22)" }}
                >
                  <BannerClock to={s.countdownTo} />
                </div>
              </div>
            )}

            <div className="mt-5 flex items-center gap-3">
              <span
                className="inline-flex h-11 items-center justify-center rounded-[13px] px-5 text-sm font-bold"
                style={{ background: "#fff", color: INK }}
              >
                {livePip ? "Your match is waiting" : s.cta}
                <span aria-hidden className="ml-1.5">
                  →
                </span>
              </span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

/** The countdown as it reads on the warm card: white numerals on dark chips. */
function BannerClock({ to }: { to: string }) {
  return (
    <span className="font-[var(--font-display)] text-2xl font-bold tabular-nums text-white sm:text-3xl">
      <Countdown to={to} compact />
    </span>
  );
}
