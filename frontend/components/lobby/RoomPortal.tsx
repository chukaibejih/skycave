"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

interface Props {
  /** Flip to true the moment the opponent joins. */
  filled: boolean;
  /** Fires after the GO collapse completes — start the game here. */
  onGo?: () => void;
  size?: number;
  /** Ring-only ambient mode: no center "waiting…"/"GO" label. */
  compact?: boolean;
}

/**
 * The Room Portal — Skycave's one moment of visual drama (spec §7).
 *
 *   waiting  → a violet ring slowly pulses, ambient glow breathing
 *   filled   → the ring sweeps full, snaps inward, and "GO" punches out
 *
 * Everything else in the app stays quiet; this is where it sings.
 */
export function RoomPortal({ filled, onGo, size = 220, compact = false }: Props) {
  const [phase, setPhase] = useState<"waiting" | "go">("waiting");

  useEffect(() => {
    if (filled && phase === "waiting") {
      setPhase("go");
      const t = setTimeout(() => onGo?.(), 1100);
      return () => clearTimeout(t);
    }
  }, [filled, phase, onGo]);

  return (
    <div
      className="portal-shadow relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* Ambient breathing glow */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: size,
          height: size,
          background:
            "radial-gradient(circle, var(--color-primary-glow), transparent 70%)",
        }}
        animate={
          phase === "waiting"
            ? { scale: [1, 1.18, 1], opacity: [0.5, 0.85, 0.5] }
            : { scale: 1.6, opacity: 0 }
        }
        transition={
          phase === "waiting"
            ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.6, ease: "easeOut" }
        }
      />

      {/* The portal ring */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        className="absolute -rotate-90"
      >
        {/* Track */}
        <circle
          cx="50"
          cy="50"
          r="44"
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="2.5"
        />
        <motion.circle
          cx="50"
          cy="50"
          r="35"
          fill="none"
          stroke="var(--color-cyan)"
          strokeWidth="0.8"
          strokeDasharray="4 7"
          opacity="0.72"
          animate={{ rotate: phase === "waiting" ? -360 : 120, opacity: [0.35, 0.85, 0.35] }}
          transition={{ duration: 11, repeat: Infinity, ease: "linear" }}
        />
        {/* Pulsing / filling arc */}
        <motion.circle
          cx="50"
          cy="50"
          r="44"
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="3.5"
          strokeLinecap="round"
          pathLength={1}
          style={{ filter: "drop-shadow(0 0 8px var(--color-primary))" }}
          initial={{ pathLength: 0.12, rotate: 0 }}
          animate={
            phase === "waiting"
              ? { pathLength: [0.1, 0.35, 0.1], rotate: 360 }
              : { pathLength: 1, rotate: 360 }
          }
          transition={
            phase === "waiting"
              ? { duration: 3, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.6, ease: "easeInOut" }
          }
        />
      </svg>

      {/* Center content: waiting dots → GO (hidden in ambient/compact mode) */}
      <AnimatePresence mode="wait">
        {compact ? null : phase === "waiting" ? (
          <motion.div
            key="waiting"
            className="font-[var(--font-body)] text-sm text-[var(--color-text-secondary)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
          >
            waiting...
          </motion.div>
        ) : (
          <motion.div
            key="go"
            className="font-[var(--font-display)] font-bold text-[var(--color-success)]"
            style={{ fontSize: size * 0.28, textShadow: "0 0 24px var(--color-success)" }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.25, 1], opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.6, ease: "backOut" }}
          >
            GO
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
