"use client";
import { motion } from "framer-motion";
import { shakeVariants } from "./Feedback";
import type { Feedback, RoundResult } from "@/lib/store";

interface RoundData {
  word: string;
  ink_hex: string;
  options: { label: string; hex: string }[];
  round_time: number;
}

interface Props {
  roundData: RoundData;
  phase: string;
  locked: boolean;
  feedback: Feedback;
  result: RoundResult | null;
  onAction: (data: Record<string, unknown>) => void;
}

export function ColorClash({
  roundData,
  phase,
  locked,
  feedback,
  result,
  onAction,
}: Props) {
  const active = phase === "active";
  const correctLabel = (result?.answer as { answer?: string })?.answer;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 px-5">
      {/* The Stroop word - drawn in the INK color, which is the answer. */}
      <motion.div
        variants={shakeVariants}
        animate={feedback === "wrong" ? "shake" : "idle"}
        className="select-none font-[var(--font-display)] text-6xl font-bold sm:text-7xl"
        style={{ color: roundData.ink_hex }}
      >
        {roundData.word}
      </motion.div>

      <p className="-mt-6 text-sm text-[var(--color-text-secondary)]">
        Tap the <b>ink color</b>, not the word.
      </p>

      {/* Color buttons - 3 cols, each ≥48px touch target. */}
      <div className="grid w-full max-w-sm grid-cols-3 gap-3">
        {roundData.options.map((opt) => {
          const isCorrect = !active && correctLabel === opt.label;
          return (
            <motion.button
              key={opt.label}
              whileTap={{ scale: 0.94 }}
              disabled={!active || locked}
              onClick={() => onAction({ choice: opt.label })}
              className="flex h-16 items-center justify-center gap-1 rounded-[var(--radius-card)] font-[var(--font-display)] text-sm font-bold text-black/80 transition-all disabled:opacity-60"
              style={{
                background: opt.hex,
                outline: isCorrect ? "3px solid var(--color-success)" : "none",
                outlineOffset: 2,
              }}
              aria-label={opt.label}
            >
              {/* Visible label aids clarity + color-blind players. The Stroop
                  challenge stays in the prompt word above, not the buttons. */}
              <span>{opt.label}</span>
              {isCorrect && <span aria-hidden>✓</span>}
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
