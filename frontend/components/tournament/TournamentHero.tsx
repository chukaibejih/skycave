"use client";
import { motion } from "framer-motion";
import { LocalTime, Scoreboard } from "@/components/tournament/Countdown";
import { statusMeta, TOURNEY } from "@/lib/tournamentStatus";
import type { Tournament } from "@/lib/api";

/**
 * The centrepiece of the "This weekend" page, themed as the synthwave night the
 * hub card introduces: a deep-purple sky with a banded retro sun on a neon
 * horizon holds the title and status in light ink, and the countdown sits in a
 * dark glass panel below. So the world stays one place from the hub card inward.
 */
export function TournamentHero({ t }: { t: Tournament }) {
  const s = statusMeta(t);
  const live = s.phase === "live" || s.phase === "finals";

  return (
    <div
      className="relative overflow-hidden rounded-[22px] border border-white/15 text-center"
      style={{ background: TOURNEY.sky, minHeight: 300, boxShadow: "0 16px 44px rgba(10,2,30,0.5)" }}
    >
      {/* A dim setting sun tucked into the corner, low enough to keep the
          centred copy readable. The bright banded sun lives on the hub card
          (left-aligned copy there), not under this centred title. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-3 h-[100px] w-[100px] rounded-full"
        style={{
          bottom: 2,
          background: `radial-gradient(circle, ${TOURNEY.sunTop} 0%, ${TOURNEY.sun} 58%, rgba(255,47,135,0) 78%)`,
        }}
        animate={{ y: [0, -3, 0], opacity: [0.62, 0.78, 0.62] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* A soft magenta glow low-left, so the night is never flat. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-10 top-16 h-40 w-40 rounded-full blur-3xl"
        style={{ background: TOURNEY.accent, opacity: 0.2 }}
      />

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
              textShadow: "0 1px 10px rgba(10,2,30,0.85)",
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
            {/* The dark glass panel, so the light clock reads on the night. */}
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
          <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed" style={{ color: TOURNEY.inkSoft, textShadow: "0 1px 10px rgba(10,2,30,0.85)" }}>
            {s.phase === "finished"
              ? "One weekend, one champion. See the whole run."
              : "Play your rounds before the weekend is out."}
          </p>
        )}
      </div>

      {/* The glowing horizon and a cyan perspective grid at the foot. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0"
        style={{ bottom: 64, height: 2, background: TOURNEY.horizon, boxShadow: `0 0 16px ${TOURNEY.horizon}` }}
      />
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 w-full"
        style={{ height: 64 }}
        viewBox="0 0 400 64"
        preserveAspectRatio="none"
      >
        {[-300, -150, -70, -25, 25, 70, 150, 300].map((x, i) => (
          <line key={i} x1="200" y1="0" x2={200 + x} y2="64" stroke={TOURNEY.grid} strokeOpacity="0.32" strokeWidth="1" />
        ))}
        {[10, 30, 64].map((y, i) => (
          <line key={`h${i}`} x1="0" y1={y} x2="400" y2={y} stroke={TOURNEY.grid} strokeOpacity="0.28" strokeWidth="1" />
        ))}
      </svg>
    </div>
  );
}
