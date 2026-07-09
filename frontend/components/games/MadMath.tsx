"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { shakeVariants } from "./Feedback";
import type { Feedback } from "@/lib/store";

interface RoundData {
  problem: string;
  options: number[];
  round_time: number;
}

interface Props {
  roundData: RoundData;
  phase: string;
  locked: boolean;
  feedback: Feedback;
  solo?: boolean;
  onAction: (data: Record<string, unknown>) => void;
}

export function MadMath({ roundData, phase, locked, feedback, solo, onAction }: Props) {
  const active = phase === "active";

  // Solo: flash the tapped option from the server's correct/wrong reply (the
  // answer is server-side, so we cannot derive it on the client like the
  // image-based games). Reset when a new problem arrives.
  const [pick, setPick] = useState<number | null>(null);
  useEffect(() => setPick(null), [roundData]);
  const flash: "correct" | "wrong" | null =
    solo && pick !== null && feedback ? (feedback === "correct" ? "correct" : "wrong") : null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 px-5">
      <motion.div
        variants={shakeVariants}
        animate={feedback === "wrong" ? "shake" : "idle"}
        className="font-[var(--font-display)] text-6xl font-bold tabular-nums"
        aria-label="problem"
      >
        {roundData.problem}
      </motion.div>

      <div className="grid w-full max-w-md grid-cols-2 gap-3">
        {roundData.options.map((opt) => {
          const isFlash = flash !== null && pick === opt;
          return (
            <motion.button
              key={opt}
              whileTap={{ scale: 0.96 }}
              disabled={!active || locked}
              onClick={() => {
                if (solo) setPick(opt);
                onAction({ choice: opt });
              }}
              className="min-h-[64px] rounded-[var(--radius-card)] border bg-[var(--color-surface)] text-2xl font-bold tabular-nums transition-colors disabled:opacity-60"
              style={
                isFlash
                  ? {
                      borderWidth: 2,
                      borderColor: flash === "correct" ? "#4FFFB0" : "#FF6B6B",
                      backgroundColor: flash === "correct" ? "#4FFFB015" : "#FF6B6B15",
                      transition: "none", // immediate, no fade in
                      opacity: 1,
                    }
                  : { borderColor: "var(--color-border)" }
              }
            >
              {opt}
            </motion.button>
          );
        })}
      </div>

      {locked && active && (
        <p className="text-sm text-[var(--color-warm)]">
          locked out · wait for the next round
        </p>
      )}
    </div>
  );
}
