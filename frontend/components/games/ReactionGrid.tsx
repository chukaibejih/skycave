"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { Feedback, RoundResult } from "@/lib/store";

interface RoundData {
  tiles: number;
  sequence: number[];
  flash_ms: number;
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

type Stage = "watch" | "input";

export function ReactionGrid({ roundData, phase, feedback, solo, onAction }: Props) {
  const active = phase === "active";
  const { sequence, flash_ms } = roundData;
  const [stage, setStage] = useState<Stage>("watch");
  const [lit, setLit] = useState<number | null>(null);
  const [input, setInput] = useState<number[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  // Play the sequence on each new round, then hand over to input.
  useEffect(() => {
    clearTimers();
    setInput([]);
    setLit(null);
    setStage("watch");
    if (!active) return;

    const onMs = flash_ms * 0.62;
    const gapMs = flash_ms;
    sequence.forEach((tile, idx) => {
      timers.current.push(setTimeout(() => setLit(tile), idx * gapMs + 250));
      timers.current.push(setTimeout(() => setLit(null), idx * gapMs + 250 + onMs));
    });
    timers.current.push(
      setTimeout(() => setStage("input"), sequence.length * gapMs + 350)
    );
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundData.sequence, active]);

  // A wrong answer resets the input so the player can re-enter (no lockout —
  // the 9^n sequence space makes blind retries pointless anyway).
  useEffect(() => {
    if (feedback === "wrong") {
      setInput([]);
      setLit(null);
    }
  }, [feedback]);

  const tap = (i: number) => {
    if (!active || stage !== "input") return;
    // brief tap flash
    setLit(i);
    timers.current.push(setTimeout(() => setLit((l) => (l === i ? null : l)), 160));
    const next = [...input, i];
    setInput(next);
    if (next.length >= sequence.length) {
      onAction({ sequence: next });
      setStage("watch"); // freeze input until result/next round
    }
  };

  const statusText = !active
    ? "round over"
    : stage === "watch"
      ? "watch the sequence…"
      : `your turn · ${input.length}/${sequence.length}`;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-5">
      <div className="text-center">
        <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-secondary)]">
          {sequence.length} tiles
        </div>
        <div className="mt-1 font-[var(--font-display)] text-xl font-semibold">
          {statusText}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: roundData.tiles }, (_, i) => {
          const isLit = lit === i;
          return (
            <motion.button
              key={i}
              whileTap={stage === "input" && active ? { scale: 0.92 } : undefined}
              disabled={stage !== "input" || !active}
              onClick={() => tap(i)}
              animate={{
                backgroundColor: isLit ? "#8b7cff" : "rgba(40,48,68,0.6)",
                boxShadow: isLit
                  ? "0 0 28px #8b7cffaa"
                  : "0 0 0px rgba(0,0,0,0)",
                scale: isLit ? 1.05 : 1,
              }}
              transition={{ duration: 0.12 }}
              className="h-24 w-24 rounded-2xl border border-[var(--color-border)]"
              aria-label={`tile ${i + 1}`}
            />
          );
        })}
      </div>

      <p className="h-5 text-sm text-[var(--color-warm)]">
        {feedback === "wrong"
          ? solo
            ? "missed · run over"
            : "wrong · watch again and retry"
          : ""}
      </p>
    </div>
  );
}
