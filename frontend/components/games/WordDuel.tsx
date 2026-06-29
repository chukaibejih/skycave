"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import type { RoundResult } from "@/lib/store";
import type { PlayerSlot } from "@/lib/types";

interface RoundData {
  letters: string[];
  round_time: number;
}

interface WordInfo {
  word: string;
  valid: boolean;
  length: number;
}

interface Props {
  roundData: RoundData;
  phase: string;
  result: RoundResult | null;
  onAction: (data: Record<string, unknown>) => void;
  submitted?: boolean;
  players?: PlayerSlot[];
  meId?: string;
}

const MIN_LEN = 3;
const P_COLOR = ["#6C63FF", "#FF6B6B"];

export function WordDuel({
  roundData,
  phase,
  result,
  onAction,
  submitted: submittedFromServer,
  players = [],
  meId,
}: Props) {
  const active = phase === "active";
  // `built` holds chosen tile indices (so repeated letters are tracked per tile).
  const [built, setBuilt] = useState<number[]>([]);
  const [submittedLocal, setSubmittedLocal] = useState(false);

  useEffect(() => {
    setBuilt([]);
    setSubmittedLocal(false);
  }, [roundData.letters]);

  const submitted = submittedLocal || !!submittedFromServer;
  const word = built.map((i) => roundData.letters[i]).join("");

  const tap = (i: number) => {
    if (!active || submitted || built.includes(i)) return;
    setBuilt((b) => [...b, i]);
  };
  const backspace = () => setBuilt((b) => b.slice(0, -1));
  const clear = () => setBuilt([]);
  const submit = () => {
    if (word.length >= MIN_LEN && !submitted) {
      onAction({ word });
      setSubmittedLocal(true);
    }
  };

  const words = (result?.answer as { words?: Record<string, WordInfo> })?.words ?? {};
  const colorFor = (pid: string) => P_COLOR[players.findIndex((p) => p.id === pid)] ?? "#9aa3ba";

  if (!active) {
    // Reveal: both players' words.
    const best = Math.max(0, ...Object.values(words).filter((w) => w.valid).map((w) => w.length));
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-5">
        <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-secondary)]">
          letters were
        </div>
        <div className="flex gap-2">
          {roundData.letters.map((l, i) => (
            <Tile key={i} letter={l} />
          ))}
        </div>
        <div className="mt-2 w-full max-w-md space-y-2">
          {players.map((p) => {
            const w = words[p.id];
            const won = w?.valid && w.length === best && best > 0;
            return (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-[var(--radius-card)] border px-3 py-2"
                style={{ borderColor: `${colorFor(p.id)}66` }}
              >
                <span className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorFor(p.id) }} />
                  {p.id === meId ? "you" : p.display_name}
                  {won && <span className="text-[var(--color-success)]">★</span>}
                </span>
                <span className="flex items-baseline gap-3">
                  <span
                    className="font-[var(--font-display)] text-base font-bold"
                    style={{ color: w?.valid ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}
                  >
                    {w?.word || "—"}
                  </span>
                  <span
                    className="font-[var(--font-display)] text-base font-bold"
                    style={{ color: w?.valid ? "var(--color-success)" : "var(--color-warm)" }}
                  >
                    {w?.valid ? `+${w.length}` : "✕"}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-7 px-5">
      <p className="text-sm text-[var(--color-text-secondary)]">
        Longest real word wins. Min {MIN_LEN} letters.
      </p>

      {/* Current word */}
      <div className="flex min-h-[44px] items-center gap-1">
        {built.length === 0 ? (
          <span className="font-[var(--font-display)] text-2xl text-[var(--color-text-secondary)]">
            tap letters…
          </span>
        ) : (
          built.map((i, k) => <Tile key={k} letter={roundData.letters[i]} small />)
        )}
      </div>

      {/* Letter rack */}
      <div className="grid grid-cols-6 gap-2">
        {roundData.letters.map((l, i) => (
          <motion.button
            key={i}
            whileTap={{ scale: 0.9 }}
            disabled={submitted || built.includes(i)}
            onClick={() => tap(i)}
            className="flex h-14 w-12 items-center justify-center rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-elevated)] font-[var(--font-display)] text-2xl font-bold transition-opacity disabled:opacity-25"
          >
            {l}
          </motion.button>
        ))}
      </div>

      {submitted ? (
        <p className="text-sm text-[var(--color-text-secondary)]">
          locked in — waiting for opponent…
        </p>
      ) : (
        <div className="flex w-full max-w-md items-center gap-2">
          <button
            onClick={backspace}
            disabled={!built.length}
            className="h-12 rounded-[var(--radius-card)] border border-[var(--color-border)] px-4 text-sm text-[var(--color-text-secondary)] disabled:opacity-40"
          >
            ⌫
          </button>
          <button
            onClick={clear}
            disabled={!built.length}
            className="h-12 rounded-[var(--radius-card)] border border-[var(--color-border)] px-4 text-sm text-[var(--color-text-secondary)] disabled:opacity-40"
          >
            clear
          </button>
          <Button full onClick={submit} disabled={word.length < MIN_LEN}>
            Submit ({word.length})
          </Button>
        </div>
      )}
    </div>
  );
}

function Tile({ letter, small }: { letter: string; small?: boolean }) {
  return (
    <span
      className={[
        "flex items-center justify-center rounded-[10px] bg-[var(--color-primary)] font-[var(--font-display)] font-bold text-white",
        small ? "h-10 w-9 text-xl" : "h-12 w-10 text-2xl",
      ].join(" ")}
    >
      {letter}
    </span>
  );
}
