"use client";
import { motion } from "framer-motion";
import { shakeVariants } from "./Feedback";
import type { Feedback, RoundResult } from "@/lib/store";

interface RoundData {
  code: string;
  options: { code: string; name: string }[];
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

export function OutlineQuiz({
  roundData,
  phase,
  locked,
  feedback,
  result,
  onAction,
}: Props) {
  const active = phase === "active";
  const answer = result?.answer as { code?: string; name?: string } | undefined;
  const maskUrl = `url(/outlines/${roundData.code}.svg)`;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-5">
      {/* Country silhouette — SVG used as a mask so it tints to our accent. */}
      <motion.div
        variants={shakeVariants}
        animate={feedback === "wrong" ? "shake" : "idle"}
        style={{
          width: 260,
          height: 200,
          maxWidth: "74vw",
          backgroundColor: active
            ? "var(--color-text-primary)"
            : "var(--color-success)",
          WebkitMaskImage: maskUrl,
          maskImage: maskUrl,
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
          WebkitMaskSize: "contain",
          maskSize: "contain",
        }}
        aria-label="country outline"
      />

      {!active && answer?.name && (
        <div className="-mt-2 font-[var(--font-display)] text-lg font-bold text-[var(--color-success)]">
          {answer.name}
        </div>
      )}

      {/* Multiple choice — 2 cols, each ≥48px. */}
      <div className="grid w-full max-w-md grid-cols-2 gap-3">
        {roundData.options.map((opt) => {
          const isCorrect = !active && answer?.code === opt.code;
          return (
            <motion.button
              key={opt.code}
              whileTap={{ scale: 0.96 }}
              disabled={!active || locked}
              onClick={() => onAction({ code: opt.code })}
              className="min-h-[52px] rounded-[var(--radius-card)] border bg-[var(--color-surface)] px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60"
              style={{
                borderColor: isCorrect
                  ? "var(--color-success)"
                  : "var(--color-border)",
              }}
            >
              {opt.name}
            </motion.button>
          );
        })}
      </div>

      {locked && active && (
        <p className="text-sm text-[var(--color-warm)]">
          locked out — wait for the next round
        </p>
      )}
    </div>
  );
}
