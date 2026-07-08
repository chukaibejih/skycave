"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
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
  solo?: boolean;
  onAction: (data: Record<string, unknown>) => void;
}

export function FlagRush({
  roundData,
  phase,
  locked,
  feedback,
  result,
  solo,
  onAction,
}: Props) {
  const active = phase === "active";
  const answer = result?.answer as { code?: string; name?: string } | undefined;

  // Solo: flash the tapped option green (correct) or red (wrong), then the next
  // prompt replaces it. Correctness is client-derivable (roundData.code is the
  // answer). Reset whenever a new prompt arrives.
  const [picked, setPicked] = useState<{ code: string; correct: boolean } | null>(null);
  useEffect(() => setPicked(null), [roundData]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-5">
      {/* Flag — bundled SVG, no external API. */}
      <motion.div
        variants={shakeVariants}
        animate={feedback === "wrong" ? "shake" : "idle"}
        className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-lg"
        style={{ width: 240, maxWidth: "72vw" }}
      >
        <Image
          src={`/flags/${roundData.code}.svg`}
          alt="flag"
          width={240}
          height={160}
          className="h-auto w-full"
          unoptimized
          priority
        />
      </motion.div>

      {!active && answer?.name && (
        <div className="font-[var(--font-display)] text-lg font-bold text-[var(--color-success)]">
          {answer.name}
        </div>
      )}

      {/* Multiple choice — 2 cols on mobile, each ≥48px. */}
      <div className="grid w-full max-w-md grid-cols-2 gap-3">
        {roundData.options.map((opt) => {
          const isCorrect = !active && answer?.code === opt.code;
          const flash = solo && picked?.code === opt.code ? picked : null;
          return (
            <motion.button
              key={opt.code}
              whileTap={{ scale: 0.96 }}
              disabled={!active || locked}
              onClick={() => {
                if (solo) {
                  if (picked) return; // one answer per prompt
                  setPicked({ code: opt.code, correct: opt.code === roundData.code });
                }
                onAction({ code: opt.code });
              }}
              className="min-h-[52px] rounded-[var(--radius-card)] border bg-[var(--color-surface)] px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60"
              style={
                flash
                  ? {
                      borderWidth: 2,
                      borderColor: flash.correct ? "#4FFFB0" : "#FF6B6B",
                      backgroundColor: flash.correct ? "#4FFFB015" : "#FF6B6B15",
                      transition: "none", // immediate, no fade in
                      opacity: 1,
                    }
                  : {
                      borderColor: isCorrect
                        ? "var(--color-success)"
                        : "var(--color-border)",
                    }
              }
            >
              {opt.name}
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
