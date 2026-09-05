"use client";
import { motion } from "framer-motion";
import { LocalTime, Scoreboard } from "@/components/tournament/Countdown";
import { statusMeta, TOURNEY } from "@/lib/tournamentStatus";
import type { Tournament } from "@/lib/api";

/**
 * The centrepiece of the "This weekend" page, themed as the tropical jungle the
 * hub card introduces: an emerald canopy, gold light shafts and low mist hold
 * the title and status in light ink.
 */
export function TournamentHero({ t }: { t: Tournament }) {
  const s = statusMeta(t);
  const live = s.phase === "live" || s.phase === "finals";

  return (
    <div
      className="relative overflow-hidden rounded-[22px] border border-white/15 text-center"
      style={{ background: TOURNEY.sky, minHeight: 300, boxShadow: "0 16px 44px rgba(2,35,18,0.58)" }}
    >
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 400 300" preserveAspectRatio="none">
        <path d="M0 0H400V84C354 61 326 93 282 72C226 45 186 91 132 69C77 46 35 77 0 101Z" fill={TOURNEY.leafDeep} />
        <path d="M0 50C42 20 79 51 107 83C65 99 31 103 0 119ZM400 50C358 19 321 51 293 83C335 100 371 102 400 119Z" fill={TOURNEY.leaf} />
        <path d="M52 0L125 300H173L141 0ZM243 0L301 300H348L324 0Z" fill={TOURNEY.shaft} opacity="0.09" />
        <path d="M0 258C70 230 122 270 186 244C251 219 333 261 400 234V300H0Z" fill={TOURNEY.ground} opacity="0.72" />
      </svg>
      <motion.div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-28" style={{ background: `linear-gradient(180deg, transparent, ${TOURNEY.mist})`, opacity: 0.18 }} animate={{ x: [-10, 10, -10] }} transition={{ duration: 13, repeat: Infinity, ease: "easeInOut" }} />

      <div className="relative z-10 px-5 pt-8 pb-6">
        <span
          className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.24em]"
          style={{ color: TOURNEY.inkSoft }}
        >
          Weekend event
        </span>
        <h1
          className="mt-2 font-[var(--font-display)] text-[clamp(2rem,8vw,3rem)] font-bold leading-[1.02]"
          style={{ color: TOURNEY.ink }}
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
            style={{
              color: s.phase === "finished" ? "#ffd36b" : TOURNEY.ink,
              textShadow: "0 1px 10px rgba(2,35,18,0.85)",
            }}
          >
            {s.label}
          </span>
        </div>

        {s.countdownTo ? (
          <div className="mt-6">
            {s.countdownCaption && (
              <p
                className="mb-3 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.2em]"
                style={{ color: TOURNEY.inkSoft }}
              >
                {s.countdownCaption}
              </p>
            )}
            {/* The dark jungle glass panel keeps the light clock readable. */}
            <div
              className="relative mx-auto max-w-max overflow-hidden rounded-[18px] px-4 pt-4 pb-3"
              style={{ background: TOURNEY.panel, border: `1px solid ${TOURNEY.accent}` }}
            >
              <Scoreboard to={s.countdownTo} accent={TOURNEY.accentSoft} />
            </div>
            <p className="mt-4 text-xs" style={{ color: TOURNEY.inkSoft }}>
              Bracket goes up at <LocalTime iso={t.registration_closes_at} />
            </p>
          </div>
        ) : (
          <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed" style={{ color: TOURNEY.inkSoft, textShadow: "0 1px 10px rgba(2,35,18,0.85)" }}>
            {s.phase === "finished"
              ? "One weekend, one champion. See the whole run."
              : "Play your rounds before the weekend is out."}
          </p>
        )}
      </div>

    </div>
  );
}
