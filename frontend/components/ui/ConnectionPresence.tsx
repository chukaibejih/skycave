"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth, useRoom } from "@/lib/store";

/**
 * Connection presence, in-game only.
 *
 * One small pip centered at the very top shows YOUR link (live / reconnecting /
 * offline) by colour, and a contextual banner just under it surfaces the
 * OPPONENT dropping mid-game, which used to leave the board silently frozen.
 *
 * Deliberately minimal and non-interactive (pointer-events-none), so it never
 * covers or blocks a game element. The reconnect transport underneath (backoff,
 * foreground/online retries, queued-move buffer) is untouched; this reflects it.
 */

const MINT = "var(--color-success)";
const AMBER = "var(--color-gold)";
const CORAL = "var(--color-warm)";

const TOP = "max(env(safe-area-inset-top),4px)";

export function ConnectionPresence() {
  const status = useRoom((s) => s.status);
  const room = useRoom((s) => s.room);
  const meId = useAuth((s) => s.identity?.id);

  // Opponent presence: only meaningful in a live 1v1.
  const opp = room?.players.find((p) => p.id !== meId) ?? null;
  const versus = (room?.players.length ?? 1) > 1;
  const inPlay = room?.status === "in_progress";
  const oppGone = versus && inPlay && opp?.connected === false;

  const prevOppGone = useRef(oppGone);
  const [oppBack, setOppBack] = useState(false);
  useEffect(() => {
    if (prevOppGone.current && !oppGone && opp) {
      setOppBack(true);
      const t = setTimeout(() => setOppBack(false), 2200);
      prevOppGone.current = oppGone;
      return () => clearTimeout(t);
    }
    prevOppGone.current = oppGone;
  }, [oppGone, opp]);

  const oppName = opp?.display_name ?? "Opponent";

  const pip =
    status === "open"
      ? { color: MINT, label: "live", pulse: false }
      : status === "closed"
        ? { color: CORAL, label: "offline", pulse: false }
        : { color: AMBER, label: "reconnecting", pulse: true };

  // Presence belongs to an active game, not the lobby or the results screen.
  // Gated after all hooks so it can never show in a waiting room.
  if (room?.status !== "in_progress") return null;

  return (
    <>
      {/* The pip. Healthy = a bare tiny dot at the very top centre, so it barely
          touches the game. It only grows into a labelled pill when the link is
          degraded (where the info matters and play is disrupted anyway).
          pointer-events-none throughout, so it can never intercept a tap. */}
      {status === "open" ? (
        <div
          className="pointer-events-none fixed left-1/2 z-40 -translate-x-1/2"
          style={{ top: TOP }}
        >
          <span
            className="block h-2 w-2 rounded-full"
            style={{ background: MINT, boxShadow: `0 0 6px ${MINT}`, opacity: 0.7 }}
          />
        </div>
      ) : (
        <div
          className="pointer-events-none fixed left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-full border px-2 py-0.5"
          style={{
            top: TOP,
            borderColor: `color-mix(in srgb, ${pip.color} 38%, transparent)`,
            background: "color-mix(in srgb, var(--color-elevated) 92%, transparent)",
            backdropFilter: "blur(4px)",
          }}
        >
          <motion.span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: pip.color, boxShadow: `0 0 6px ${pip.color}` }}
            animate={pip.pulse ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
            transition={pip.pulse ? { duration: 1.1, repeat: Infinity } : { duration: 0.2 }}
          />
          <span
            className="font-[var(--font-mono)] text-[9px] uppercase tracking-[0.1em]"
            style={{ color: pip.color }}
          >
            {pip.label}
          </span>
        </div>
      )}

      {/* Opponent presence: contextual, just under the pip, also non-blocking. */}
      <AnimatePresence>
        {oppGone && (
          <motion.div
            key="opp-gone"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="pointer-events-none fixed left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1 text-[11px]"
            style={{
              top: `calc(${TOP} + 24px)`,
              borderColor: `color-mix(in srgb, ${AMBER} 40%, transparent)`,
              background: "color-mix(in srgb, var(--color-elevated) 92%, transparent)",
              backdropFilter: "blur(4px)",
              color: "var(--color-text-primary)",
            }}
          >
            <Spinner color={AMBER} />
            Waiting for {oppName}
            <span style={{ color: "var(--color-text-secondary)" }}>· game held</span>
          </motion.div>
        )}

        {oppBack && !oppGone && (
          <motion.div
            key="opp-back"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="pointer-events-none fixed left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[11px]"
            style={{
              top: `calc(${TOP} + 24px)`,
              borderColor: `color-mix(in srgb, ${MINT} 45%, transparent)`,
              background: "color-mix(in srgb, var(--color-elevated) 92%, transparent)",
              color: "var(--color-text-primary)",
            }}
          >
            <span style={{ color: MINT }}>✓</span>
            {oppName} is back
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Spinner({ color }: { color: string }) {
  return (
    <motion.span
      className="inline-block h-3 w-3 rounded-full border-2"
      style={{ borderColor: `${color} transparent ${color} ${color}` }}
      animate={{ rotate: 360 }}
      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
    />
  );
}
