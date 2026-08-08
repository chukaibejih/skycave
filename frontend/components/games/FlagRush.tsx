"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
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

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { y: 15, opacity: 0 },
  show: { y: 0, opacity: 1 },
};

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
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-5 overflow-hidden">
      {/* Outer motion div handles entrance scale/fade per round */}
      <motion.div
        key={`flag-${roundData.code}`}
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        {/* Inner motion div handles the shake feedback on wrong answer */}
        <motion.div
          variants={shakeVariants}
          animate={feedback === "wrong" ? "shake" : "idle"}
          className="relative overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-xl"
          style={{ width: 240, maxWidth: "72vw" }}
        >
          {/* Subtle glossy fabric waving overlay */}
          <motion.div
            animate={{ backgroundPosition: ["200% 0%", "-100% 0%"] }}
            transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
            className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(105deg,transparent_20%,rgba(255,255,255,0.06)_45%,rgba(255,255,255,0.12)_50%,rgba(255,255,255,0.06)_55%,transparent_80%)] bg-[length:200%_100%]"
          />

          <Image
            src={`/flags/${roundData.code}.svg`}
            alt="flag"
            width={240}
            height={160}
            className="h-auto w-full object-cover"
            unoptimized
            priority
          />
        </motion.div>
      </motion.div>

      {!active && answer?.name && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-[var(--font-display)] text-lg font-bold text-[var(--color-success)]"
        >
          {answer.name}
        </motion.div>
      )}

      {/* Multiple choice container handles staggered children */}
      <motion.div
        key={`opts-${roundData.code}`}
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid w-full max-w-md grid-cols-2 gap-3"
      >
        {roundData.options.map((opt) => {
          const isCorrect = !active && answer?.code === opt.code;
          const flash = solo && picked?.code === opt.code ? picked : null;
          return (
            <motion.button
              key={opt.code}
              variants={itemVariants}
              whileTap={{ scale: 0.94 }}
              disabled={!active || locked}
              onClick={() => {
                if (solo) {
                  if (picked) return; // one answer per prompt
                  setPicked({ code: opt.code, correct: opt.code === roundData.code });
                }
                onAction({ code: opt.code });
              }}
              className="relative min-h-[52px] rounded-[var(--radius-card)] border bg-[var(--color-surface)] px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60"
              style={
                flash
                  ? {
                      borderWidth: 2,
                      borderColor: flash.correct ? "#4FFFB0" : "#FF6B6B",
                      backgroundColor: flash.correct ? "#4FFFB015" : "#FF6B6B15",
                      boxShadow: flash.correct ? "0 0 15px rgba(79, 255, 176, 0.4)" : "none",
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
              <span className="relative z-10">{opt.name}</span>
              
              {/* Floating +1 for correct answers */}
              <AnimatePresence>
                {flash?.correct && (
                  <motion.div
                    initial={{ opacity: 0, y: 0, scale: 0.8 }}
                    animate={{ opacity: 1, y: -40, scale: 1.2 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 font-[var(--font-display)] text-2xl font-bold text-[var(--color-success)] drop-shadow-lg"
                  >
                    +1
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </motion.div>

      {locked && active && (
        <p className="text-sm text-[var(--color-warm)]">
          locked out · wait for the next round
        </p>
      )}
    </div>
  );
}
