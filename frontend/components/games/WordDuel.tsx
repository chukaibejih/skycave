"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { useRoom, type RoundResult } from "@/lib/store";
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
  solo?: boolean;
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
  solo,
}: Props) {
  const active = phase === "active";

  // Solo: one letter set for the whole 60s; submit as many words as you can.
  if (solo) return <SoloWordDuel letters={roundData.letters} onAction={onAction} />;

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

  const removeAt = (index: number) => {
    if (!active || submitted) return;
    setBuilt((b) => b.filter((_, k) => k !== index));
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
                className="flex items-center justify-between rounded-[var(--radius-card)] border px-3.5 py-2.5 bg-[var(--color-surface)]/60"
                style={{ borderColor: `${colorFor(p.id)}66` }}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorFor(p.id) }} />
                  {p.id === meId ? "you" : p.display_name}
                  {won && <span className="text-[var(--color-gold)] font-bold">★ Winner</span>}
                </span>
                <span className="flex items-baseline gap-3">
                  <span
                    className="font-[var(--font-display)] text-base font-bold tracking-wide"
                    style={{ color: w?.valid ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}
                  >
                    {w?.word || "-"}
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
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-5 py-4">
      <p className="text-xs font-[var(--font-mono)] uppercase tracking-wider text-[var(--color-text-secondary)]">
        Longest real word wins · Min {MIN_LEN} letters
      </p>

      {/* Built word display (Fixed centered width container) */}
      <div className="flex items-center justify-center min-h-[56px] w-full max-w-md">
        <div className="flex items-center justify-center gap-1.5 min-h-[56px] min-w-[220px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/80 px-4 py-2 shadow-inner">
          <AnimatePresence mode="popLayout">
            {built.length === 0 ? (
              <span className="font-[var(--font-display)] text-xl text-[var(--color-text-secondary)]">
                tap letters…
              </span>
            ) : (
              built.map((i, k) => (
                <motion.button
                  key={`${k}-${roundData.letters[i]}`}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => removeAt(k)}
                  className="flex h-11 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)] font-[var(--font-display)] text-xl font-bold text-white shadow-[0_2px_8px_var(--color-primary-glow)] transition-transform"
                  title="Tap to remove"
                >
                  {roundData.letters[i]}
                </motion.button>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Letter rack */}
      <div className="grid grid-cols-6 gap-2 w-full max-w-md justify-items-center">
        {roundData.letters.map((l, i) => {
          const isUsed = built.includes(i);
          return (
            <motion.button
              key={i}
              whileTap={{ scale: isUsed ? 1 : 0.92 }}
              disabled={submitted || isUsed}
              onClick={() => tap(i)}
              className={`flex h-14 w-12 items-center justify-center rounded-[var(--radius-card)] border font-[var(--font-display)] text-2xl font-bold transition-all ${
                isUsed
                  ? "border-transparent bg-[var(--color-surface)]/40 text-[var(--color-text-secondary)] opacity-30 cursor-not-allowed"
                  : "border-[var(--color-border)] bg-[var(--color-elevated)] text-[var(--color-text-primary)] shadow-sm hover:border-[var(--color-primary)]"
              }`}
            >
              {l}
            </motion.button>
          );
        })}
      </div>

      {/* Bottom Control Deck: Submit on left + Fixed Bottom-Right Delete & Clear Keys */}
      <div className="flex w-full max-w-md items-center gap-2">
        <div className="flex-1">
          {submitted ? (
            <div className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/50 py-3.5 text-center font-[var(--font-mono)] text-xs uppercase tracking-wider text-[var(--color-text-secondary)]">
              locked in · waiting for opponent…
            </div>
          ) : (
            <Button
              full
              onClick={submit}
              disabled={word.length < MIN_LEN}
              className="h-13 text-base font-bold shadow-md"
            >
              {word.length < MIN_LEN
                ? `Min ${MIN_LEN} letters`
                : `Submit "${word}" (+${word.length})`}
            </Button>
          )}
        </div>

        {/* Noticeable & Unique Bottom-Right Delete & Clear Keys */}
        {!submitted && (
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Delete / Backspace Key */}
            <motion.button
              whileTap={{ scale: 0.92 }}
              disabled={!built.length}
              onClick={backspace}
              aria-label="Delete last letter"
              className="flex h-13 w-12 items-center justify-center rounded-2xl border-2 border-[#ff453a] bg-[#ff453a]/20 font-[var(--font-display)] text-xl font-bold text-[#ff453a] shadow-[0_0_15px_rgba(255,69,58,0.25)] transition-all hover:bg-[#ff453a]/30 active:scale-95 disabled:opacity-25 disabled:border-[var(--color-border)] disabled:bg-[var(--color-surface)] disabled:text-[var(--color-text-secondary)] disabled:shadow-none"
              title="Delete last letter"
            >
              ⌫
            </motion.button>

            {/* Clear Key */}
            <motion.button
              whileTap={{ scale: 0.92 }}
              disabled={!built.length}
              onClick={clear}
              className="flex h-13 px-3.5 items-center justify-center rounded-2xl border-2 border-[var(--color-warm)] bg-[var(--color-warm)]/20 font-[var(--font-mono)] text-xs font-bold uppercase tracking-wider text-[var(--color-warm)] shadow-[0_0_15px_rgba(255,159,10,0.2)] transition-all hover:bg-[var(--color-warm)]/30 active:scale-95 disabled:opacity-25 disabled:border-[var(--color-border)] disabled:bg-[var(--color-surface)] disabled:text-[var(--color-text-secondary)] disabled:shadow-none"
              title="Clear all letters"
            >
              clear
            </motion.button>
          </div>
        )}
      </div>
    </div>
  );
}

function SoloWordDuel({
  letters,
  onAction,
}: {
  letters: string[];
  onAction: (data: Record<string, unknown>) => void;
}) {
  const soloWords = useRoom((s) => s.soloWords);
  const feedback = useRoom((s) => s.feedback);
  const [built, setBuilt] = useState<number[]>([]);
  const [lastTried, setLastTried] = useState<string | null>(null);

  useEffect(() => {
    setBuilt([]);
    setLastTried(null);
  }, [letters]);

  const word = built.map((i) => letters[i]).join("");
  const tap = (i: number) => {
    if (built.includes(i)) return;
    setBuilt((b) => [...b, i]);
  };

  const removeAt = (index: number) => {
    setBuilt((b) => b.filter((_, k) => k !== index));
  };

  const backspace = () => setBuilt((b) => b.slice(0, -1));
  const clear = () => setBuilt([]);

  const submit = () => {
    if (word.length < MIN_LEN) return;
    onAction({ word });
    setLastTried(word);
    setBuilt([]);
  };

  // A rejected word (wrong feedback) that isn't in the accepted list.
  const rejected =
    feedback === "wrong" && lastTried !== null && !soloWords.includes(lastTried);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-5 py-4">
      <p className="text-xs font-[var(--font-mono)] uppercase tracking-wider text-[var(--color-text-secondary)]">
        Make as many words as you can · Min {MIN_LEN} letters
      </p>

      {/* Built word display (Fixed centered width container) */}
      <div className="flex items-center justify-center min-h-[56px] w-full max-w-md">
        <div className="flex items-center justify-center gap-1.5 min-h-[56px] min-w-[220px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/80 px-4 py-2 shadow-inner">
          <AnimatePresence mode="popLayout">
            {built.length === 0 ? (
              <span
                className={`font-[var(--font-display)] text-xl ${
                  rejected ? "text-[var(--color-warm)] font-medium" : "text-[var(--color-text-secondary)]"
                }`}
              >
                {rejected ? `${lastTried} · not a word` : "tap letters…"}
              </span>
            ) : (
              built.map((i, k) => (
                <motion.button
                  key={`${k}-${letters[i]}`}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => removeAt(k)}
                  className="flex h-11 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)] font-[var(--font-display)] text-xl font-bold text-white shadow-[0_2px_8px_var(--color-primary-glow)] transition-transform"
                  title="Tap to remove"
                >
                  {letters[i]}
                </motion.button>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Letter rack */}
      <div className="grid grid-cols-6 gap-2 w-full max-w-md justify-items-center">
        {letters.map((l, i) => {
          const isUsed = built.includes(i);
          return (
            <motion.button
              key={i}
              whileTap={{ scale: isUsed ? 1 : 0.92 }}
              disabled={isUsed}
              onClick={() => tap(i)}
              className={`flex h-14 w-12 items-center justify-center rounded-[var(--radius-card)] border font-[var(--font-display)] text-2xl font-bold transition-all ${
                isUsed
                  ? "border-transparent bg-[var(--color-surface)]/40 text-[var(--color-text-secondary)] opacity-30 cursor-not-allowed"
                  : "border-[var(--color-border)] bg-[var(--color-elevated)] text-[var(--color-text-primary)] shadow-sm hover:border-[var(--color-primary)]"
              }`}
            >
              {l}
            </motion.button>
          );
        })}
      </div>

      {/* Bottom Control Deck: Submit on left + Fixed Bottom-Right Delete & Clear Keys */}
      <div className="flex w-full max-w-md items-center gap-2">
        <div className="flex-1">
          <Button
            full
            onClick={submit}
            disabled={word.length < MIN_LEN}
            className="h-13 text-base font-bold shadow-md"
          >
            {word.length < MIN_LEN
              ? `Min ${MIN_LEN} letters`
              : `Submit "${word}" (+${word.length})`}
          </Button>
        </div>

        {/* Noticeable & Unique Bottom-Right Delete & Clear Keys */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Delete / Backspace Key */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            disabled={!built.length}
            onClick={backspace}
            aria-label="Delete last letter"
            className="flex h-13 w-12 items-center justify-center rounded-2xl border-2 border-[#ff453a] bg-[#ff453a]/20 font-[var(--font-display)] text-xl font-bold text-[#ff453a] shadow-[0_0_15px_rgba(255,69,58,0.25)] transition-all hover:bg-[#ff453a]/30 active:scale-95 disabled:opacity-25 disabled:border-[var(--color-border)] disabled:bg-[var(--color-surface)] disabled:text-[var(--color-text-secondary)] disabled:shadow-none"
            title="Delete last letter"
          >
            ⌫
          </motion.button>

          {/* Clear Key */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            disabled={!built.length}
            onClick={clear}
            className="flex h-13 px-3.5 items-center justify-center rounded-2xl border-2 border-[var(--color-warm)] bg-[var(--color-warm)]/20 font-[var(--font-mono)] text-xs font-bold uppercase tracking-wider text-[var(--color-warm)] shadow-[0_0_15px_rgba(255,159,10,0.2)] transition-all hover:bg-[var(--color-warm)]/30 active:scale-95 disabled:opacity-25 disabled:border-[var(--color-border)] disabled:bg-[var(--color-surface)] disabled:text-[var(--color-text-secondary)] disabled:shadow-none"
            title="Clear all letters"
          >
            clear
          </motion.button>
        </div>
      </div>

      {/* Accepted words so far */}
      <div className="flex max-h-28 w-full max-w-md flex-wrap content-start justify-center gap-1.5 overflow-y-auto pt-2">
        {soloWords.map((w) => (
          <span
            key={w}
            className="rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 font-[var(--font-mono)] text-xs font-semibold text-[var(--color-text-primary)] shadow-xs"
          >
            {w}
            <span className="ml-1.5 font-bold text-[var(--color-success)]">+{w.length}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Tile({ letter, small }: { letter: string; small?: boolean }) {
  return (
    <span
      className={[
        "flex items-center justify-center rounded-[10px] bg-[var(--color-primary)] font-[var(--font-display)] font-bold text-white shadow-sm",
        small ? "h-10 w-9 text-xl" : "h-12 w-10 text-2xl",
      ].join(" ")}
    >
      {letter}
    </span>
  );
}
