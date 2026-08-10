"use client";
import { motion } from "framer-motion";
import { LocalTime, Scoreboard } from "@/components/tournament/Countdown";
import { statusMeta, TOURNEY } from "@/lib/tournamentStatus";
import type { Tournament } from "@/lib/api";

/**
 * The centrepiece of the "This weekend" page, themed as the beach the hub card
 * introduces: a bright sky with a low sun holds the title and status in dark
 * ink, and the countdown sits in a pool of deep sea below, where its light
 * numerals read. So the world stays one place from the hub card inward.
 */
export function TournamentHero({ t }: { t: Tournament }) {
  const s = statusMeta(t);
  const live = s.phase === "live" || s.phase === "finals";

  return (
    <div
      className="relative overflow-hidden rounded-[22px] border border-white/50 text-center"
      style={{ background: TOURNEY.sky, minHeight: 300, boxShadow: "0 16px 44px rgba(4,48,63,0.28)" }}
    >
      {/* The low sun, drifting. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute right-8 top-7 h-[86px] w-[86px] rounded-full"
        style={{
          background: `radial-gradient(circle, ${TOURNEY.sunCore} 0%, ${TOURNEY.sun} 52%, rgba(255,206,106,0) 74%)`,
        }}
        animate={{ y: [0, -5, 0], opacity: [0.92, 1, 0.92] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* A soft second sun-glow low-left, so the sky is never flat. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-10 top-16 h-40 w-40 rounded-full blur-3xl"
        style={{ background: TOURNEY.sun, opacity: 0.18 }}
      />

      <div className="relative z-10 px-5 pt-8 pb-6">
        <span className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.24em]" style={{ color: "#0a6072" }}>
          Weekend event
        </span>
        <h1
          className="mt-2 font-[var(--font-display)] text-[clamp(2rem,8vw,3rem)] font-bold leading-[1.02]"
          style={{ color: TOURNEY.ink, textShadow: "0 1px 0 rgba(255,255,255,0.4)" }}
        >
          {t.name}
        </h1>

        {/* Status: a state-coloured pip, but the words in readable ink. */}
        <div className="mt-4 flex items-center justify-center gap-2.5">
          {live && (
            <motion.span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: s.color, boxShadow: `0 0 12px ${s.color}` }}
              animate={{ opacity: [1, 0.35, 1] }}
              transition={{ duration: 1.3, repeat: Infinity }}
            />
          )}
          <span
            className="font-[var(--font-display)] text-2xl font-bold sm:text-3xl"
            style={{ color: s.phase === "finished" ? "#b8791a" : TOURNEY.ink }}
          >
            {s.label}
          </span>
        </div>

        {s.countdownTo ? (
          <div className="mt-6">
            {s.countdownCaption && (
              <p className="mb-3 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.2em]" style={{ color: "#0a6072" }}>
                {s.countdownCaption}
              </p>
            )}
            {/* The deep-sea pool: dark water so the light clock reads, with foam
                on its surface. */}
            <div
              className="relative mx-auto max-w-max overflow-hidden rounded-[18px] px-4 pt-4 pb-3"
              style={{ background: "linear-gradient(180deg, #0e7a91 0%, #063a49 100%)", border: "1px solid rgba(255,255,255,0.18)" }}
            >
              <motion.svg
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-4 w-full"
                viewBox="0 0 400 16"
                preserveAspectRatio="none"
                animate={{ x: [0, -14, 0] }}
                transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
              >
                <path d="M-20 9 C 50 3, 110 14, 180 8 S 320 3, 420 9" fill="none" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="2" />
              </motion.svg>
              <Scoreboard to={s.countdownTo} accent={TOURNEY.accentSoft} />
            </div>
            <p className="mt-4 text-xs" style={{ color: "#0a6072" }}>
              Bracket goes up at <LocalTime iso={t.registration_closes_at} />
            </p>
          </div>
        ) : (
          <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed" style={{ color: "#0a5566" }}>
            {s.phase === "finished"
              ? "One weekend, one champion. See the whole run."
              : "Play your rounds before the weekend is out."}
          </p>
        )}
      </div>

      {/* Waves lapping the foot of the hero, over a thin shore of sand. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0" style={{ height: 10, background: TOURNEY.sand }} />
      <motion.svg
        aria-hidden
        className="pointer-events-none absolute inset-x-0"
        style={{ bottom: 8, height: 16 }}
        viewBox="0 0 400 16"
        preserveAspectRatio="none"
        animate={{ x: [0, 12, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
      >
        <path d="M-20 10 C 60 4, 130 15, 210 9 S 350 3, 420 10 L420 16 L-20 16 Z" fill={TOURNEY.accent} opacity="0.5" />
      </motion.svg>
    </div>
  );
}
