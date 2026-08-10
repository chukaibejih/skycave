"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Countdown } from "@/components/tournament/Countdown";
import { statusMeta, TOURNEY } from "@/lib/tournamentStatus";
import { useTournamentSignal } from "@/lib/useTournamentSignal";
import type { Tournament } from "@/lib/api";

/**
 * The tournament's entry point on the hub, rebuilt per season as a scene rather
 * than a card. This week it is a bright beach: a sky with a low sun, a sea with
 * drifting foam, a strip of sand. It shares nothing with the dark championship
 * card of week one on purpose, so the hub feels like a new place each weekend.
 *
 * Everything is driven from TOURNEY, so next week's scene is a palette swap.
 * Pass `preview` to render a specific (mock) tournament for design review.
 */

const BASE_SHADOW = "0 16px 44px rgba(4, 48, 63, 0.32)";
// The final-stretch pulse: a warm coral halo, at home on the bright scene.
const CORAL_PULSE = [
  "0 16px 44px rgba(4,48,63,0.28), 0 0 0px 0px rgba(229,83,61,0)",
  "0 18px 50px rgba(229,83,61,0.30), 0 0 30px 6px rgba(229,83,61,0.45)",
  "0 16px 44px rgba(4,48,63,0.28), 0 0 0px 0px rgba(229,83,61,0)",
];
const URGENT_MS = 12 * 60 * 60 * 1000;

export function TournamentBanner({ preview }: { preview?: Tournament } = {}) {
  const signal = useTournamentSignal();
  const t = preview ?? signal.tournament;
  const livePip = preview ? false : signal.livePip;
  if (!t) return null;

  const s = statusMeta(t);
  const href = s.phase === "finished" ? `/tournament/${t.id}` : "/tournament";
  const spots =
    s.phase === "open" && t.spots_left > 0
      ? `${t.spots_left} ${t.spots_left === 1 ? "spot" : "spots"} left`
      : null;

  const closesMs = s.countdownTo ? new Date(s.countdownTo).getTime() - Date.now() : Infinity;
  const urgent = s.phase === "open" && t.spots_left > 0 && closesMs > 0 && closesMs < URGENT_MS;

  const eyebrow = urgent ? "Closing soon" : s.phase === "finished" ? "Weekend event" : "Weekend event";
  const label = urgent ? "Last call" : s.label;
  const cta = livePip
    ? "Your match is waiting"
    : urgent
      ? "Claim your spot"
      : s.cta === "Grab your slot"
        ? "Claim your spot"
        : s.cta;
  const live = urgent || s.phase === "live" || s.phase === "finals";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 24 }}
    >
      <Link href={href} className="block group">
        <motion.div
          className="relative overflow-hidden rounded-[22px] border border-white/50"
          style={{ minHeight: 268, background: TOURNEY.sky }}
          animate={{ boxShadow: urgent ? CORAL_PULSE : BASE_SHADOW }}
          transition={
            urgent ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }
          }
        >
          {/* Sun, low over the water, with a soft bob. */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute right-7 top-6 h-[76px] w-[76px] rounded-full"
            style={{
              background: `radial-gradient(circle, ${TOURNEY.sunCore} 0%, ${TOURNEY.sun} 52%, rgba(255,206,106,0) 74%)`,
            }}
            animate={{ y: [0, -5, 0], opacity: [0.92, 1, 0.92] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* The sea fills the lower third; the sand is a thin shore beneath it. */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0" style={{ height: "34%", background: TOURNEY.sea }} />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0" style={{ height: "6%", background: TOURNEY.sand }} />

          {/* Drifting foam lines at the waterline. */}
          <motion.svg
            aria-hidden
            className="pointer-events-none absolute inset-x-0"
            style={{ bottom: "31%", height: 22 }}
            viewBox="0 0 400 22"
            preserveAspectRatio="none"
            animate={{ x: [0, -16, 0] }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          >
            <path d="M-20 12 C 40 4, 90 18, 150 11 S 280 4, 420 12" fill="none" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="2" />
            <path d="M-20 18 C 60 12, 120 22, 200 16 S 340 10, 420 18" fill="none" stroke="#ffffff" strokeOpacity="0.32" strokeWidth="2" />
          </motion.svg>
          {/* Foam where the sea meets the sand. */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0" style={{ bottom: "6%", height: 2, background: "rgba(255,255,255,0.65)" }} />

          <div className="relative z-10 flex min-h-[268px] flex-col p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.2em] backdrop-blur-sm"
                style={{ background: "rgba(255,255,255,0.55)", color: TOURNEY.ink }}
              >
                {live && (
                  <motion.span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: urgent ? TOURNEY.coral : "#0e8aa0" }}
                    animate={{ opacity: [1, 0.25, 1], scale: [1, 1.2, 1] }}
                    transition={{ duration: urgent ? 0.85 : 1.3, repeat: Infinity }}
                  />
                )}
                {eyebrow}
              </span>
            </div>

            <h2
              className="mt-3 font-[var(--font-display)] text-2xl font-bold leading-[1.05] sm:text-3xl"
              style={{ color: TOURNEY.ink, textShadow: "0 1px 0 rgba(255,255,255,0.35)" }}
            >
              {t.name}
            </h2>

            <p className="mt-2 text-xs font-medium leading-snug sm:text-sm" style={{ color: "#0a5566" }}>
              Free to enter &middot; 1v1 weekend bracket &middot; Crowned Monday
            </p>

            <p className="mt-3 text-xs font-bold uppercase tracking-wide" style={{ color: urgent ? TOURNEY.coral : "#0a6072" }}>
              {label}
              {spots && ` · ${spots}`}
            </p>

            {s.countdownTo && (
              <div className="mt-4">
                <div
                  className="inline-flex rounded-[14px] px-3 py-2 backdrop-blur-sm"
                  style={{ background: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.7)" }}
                >
                  <BannerClock to={s.countdownTo} />
                </div>
              </div>
            )}

            <div className="mt-auto pt-6">
              <motion.span
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex h-11 items-center justify-center rounded-[13px] px-5 text-sm font-bold shadow-[0_6px_16px_rgba(4,48,63,0.25)]"
                style={{ background: urgent ? TOURNEY.coral : TOURNEY.sun, color: urgent ? "#fff" : TOURNEY.ink }}
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

/** The countdown as it reads on the bright scene: deep-navy numerals on a frosted chip. */
function BannerClock({ to }: { to: string }) {
  return (
    <span className="font-[var(--font-display)] text-2xl font-bold tabular-nums sm:text-3xl" style={{ color: TOURNEY.ink }}>
      <Countdown to={to} compact />
    </span>
  );
}
