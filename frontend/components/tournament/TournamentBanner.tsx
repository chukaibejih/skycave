"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Countdown, Weekday, clockIsLive } from "@/components/tournament/Countdown";
import { statusMeta } from "@/lib/tournamentStatus";
import { useTournamentSignal } from "@/lib/useTournamentSignal";

/**
 * The tournament's entry point on the hub, overhauled for a premium feel.
 *
 * It uses a sleek dark glassmorphic aesthetic with an ethereal, animated
 * cyan and amber orb floating behind the content to convey an exclusive,
 * high-stakes championship vibe.
 */

const BASE_SHADOW = "0 14px 40px rgba(0, 0, 0, 0.5)";
// The final-stretch pulse: a red halo that blinks in and out.
const RED_PULSE = [
  "0 14px 40px rgba(220, 30, 30, 0.15), 0 0 0px 0px rgba(220,30,30,0)",
  "0 16px 46px rgba(220, 30, 30, 0.35), 0 0 34px 6px rgba(220,30,30,0.5)",
  "0 14px 40px rgba(220, 30, 30, 0.15), 0 0 0px 0px rgba(220,30,30,0)",
];
// How close to the deadline the red urgency kicks in.
const URGENT_MS = 12 * 60 * 60 * 1000;

export function TournamentBanner() {
  const { tournament: t, livePip } = useTournamentSignal();
  if (!t) return null;

  const s = statusMeta(t);
  const href = s.phase === "finished" ? `/tournament/${t.id}` : "/tournament";
  const spots =
    s.phase === "open" && t.spots_left > 0
      ? `${t.spots_left} ${t.spots_left === 1 ? "spot" : "spots"} left`
      : null;

  // Registration open, seats left, and the deadline is inside the final stretch.
  const closesMs = s.countdownTo ? new Date(s.countdownTo).getTime() - Date.now() : Infinity;
  const urgent = s.phase === "open" && t.spots_left > 0 && closesMs > 0 && closesMs < URGENT_MS;

  // Eyebrow says "Closing soon"; keep the sub-label on the action so they don't echo.
  const label = urgent ? "Last call" : s.label;
  const cta = livePip ? "Your match is waiting" : urgent ? "Claim Your Spot" : s.cta === "Grab your slot" ? "Claim Your Spot" : s.cta;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 24 }}
    >
      <Link href={href} className="block group">
        <motion.div
          className="relative overflow-hidden rounded-[22px] border border-white/10 bg-black/50 p-5 backdrop-blur-xl sm:p-6"
          animate={{ boxShadow: urgent ? RED_PULSE : BASE_SHADOW }}
          transition={
            urgent
              ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.3 }
          }
        >
          {/* Animated Ambient Orb - Mixing Cyan and Amber */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -right-32 -top-32 h-[400px] w-[400px] rounded-full opacity-40 mix-blend-screen"
            style={{
              background: "radial-gradient(circle, var(--color-cyan) 0%, #ffb64d 45%, transparent 70%)",
              filter: "blur(40px)",
            }}
            animate={{
              scale: [1, 1.25, 1],
              opacity: [0.3, 0.6, 0.3],
              rotate: [0, 90, 0],
            }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* Abstract floating trophy/championship graphic on the right */}
          <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 opacity-20 mix-blend-overlay transition-opacity duration-500 group-hover:opacity-40 sm:right-10">
            <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-[#ffb64d]">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
          </div>

          <div className="relative z-10">
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.2em] text-white/90 backdrop-blur-md"
                style={{ background: urgent ? "rgba(200, 22, 22, 0.3)" : "rgba(255, 255, 255, 0.05)" }}
              >
                {(urgent || s.phase === "live" || s.phase === "finals") && (
                  <motion.span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: urgent ? "#ff4444" : "var(--color-cyan)" }}
                    animate={{ opacity: [1, 0.25, 1], scale: [1, 1.2, 1] }}
                    transition={{ duration: urgent ? 0.85 : 1.3, repeat: Infinity }}
                  />
                )}
                {urgent ? "Closing soon" : "Weekend event"}
              </span>
            </div>

            <h2 className="mt-3 font-[var(--font-display)] text-2xl font-bold leading-[1.05] text-white drop-shadow-md sm:text-3xl">
              {t.name}
            </h2>

            <p className="mt-2 text-xs font-medium leading-snug text-white/80 sm:text-sm">
              Free to enter &middot; 1v1 weekend bracket &middot; Crowned Monday
            </p>

            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-[var(--color-cyan)] drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]">
              {label}
              {spots && ` · ${spots}`}
            </p>

            {s.countdownTo && (
              <div className="mt-4">
                <div className="inline-flex rounded-[14px] border border-white/10 bg-black/40 px-3 py-2 backdrop-blur-md">
                  <BannerClock to={s.countdownTo} />
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center gap-3">
              <motion.span
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex h-11 items-center justify-center rounded-[13px] border border-white/20 bg-white/10 px-5 text-sm font-bold text-white shadow-[0_4px_12px_rgba(0,0,0,0.2)] backdrop-blur-md transition-colors group-hover:bg-white/20"
              >
                {cta}
                <span aria-hidden className="ml-1.5 transition-transform duration-300 group-hover:translate-x-1">
                  →
                </span>
              </motion.span>
            </div>
          </div>
        </motion.div>
      </Link>
    </motion.div>
  );
}

/** The countdown as it reads on the dark glass card: white numerals on dark chips. */
function BannerClock({ to }: { to: string }) {
  return (
    <span className="font-[var(--font-display)] text-2xl font-bold tabular-nums text-white sm:text-3xl drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">
      <Countdown to={to} compact />
    </span>
  );
}
