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

interface HuntInfo {
  words: string[]; // the longest words found this round (for the reveal)
  count: number;
  points: number;
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
  players = [],
  meId,
  solo,
}: Props) {
  const active = phase === "active";

  // Solo: one letter set for the whole 60s; submit as many words as you can.
  if (solo) return <SoloWordDuel letters={roundData.letters} onAction={onAction} />;

  // 1v1 is a head-to-head hunt: both get the same letters the whole round, every
  // word accumulates, higher total wins. Same accumulation state as solo.
  const soloWords = useRoom((s) => s.soloWords);
  const feedback = useRoom((s) => s.feedback);
  const roundScores = useRoom((s) => s.roundScores);
  const [built, setBuilt] = useState<number[]>([]);
  const [lastTried, setLastTried] = useState<string | null>(null);

  useEffect(() => {
    setBuilt([]);
    setLastTried(null);
  }, [roundData.letters]);

  const word = built.map((i) => roundData.letters[i]).join("");
  const colorFor = (pid: string) => P_COLOR[players.findIndex((p) => p.id === pid)] ?? "#9aa3ba";
  const opp = players.find((p) => p.id !== meId);
  const rejected = feedback === "wrong" && lastTried !== null && !soloWords.includes(lastTried);

  const tap = (i: number) => {
    if (!active || built.includes(i)) return;
    setBuilt((b) => [...b, i]);
  };
  const removeAt = (index: number) => setBuilt((b) => b.filter((_, k) => k !== index));
  const backspace = () => setBuilt((b) => b.slice(0, -1));
  const clear = () => setBuilt([]);

  const submit = () => {
    if (word.length < MIN_LEN) return;
    onAction({ word }); // accumulate: submit and keep hunting, no lock
    setLastTried(word);
    setBuilt([]);
  };

  if (!active) {
    const hunt = (result?.answer as { hunt?: Record<string, HuntInfo> })?.hunt ?? {};
    const totals = (result as unknown as { scores?: Record<string, number> })?.scores ?? {};
    const myTotal = meId ? totals[meId] ?? 0 : 0;
    const oppTotal = opp ? totals[opp.id] ?? 0 : 0;
    const iLead = myTotal > oppTotal;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-5">
        <div className="flex gap-1.5">
          {roundData.letters.map((l, i) => (
            <Tile key={i} letter={l} />
          ))}
        </div>
        {/* the match total race */}
        <div className="flex items-center gap-3 font-[var(--font-display)] tracking-tight">
          <span className="text-4xl font-black tabular-nums" style={{ color: iLead ? "var(--color-success)" : "var(--color-text-primary)" }}>{myTotal}</span>
          <span className="text-sm font-bold text-[var(--color-text-secondary)]">You</span>
          {opp && <span className="text-lg font-bold text-[var(--color-text-secondary)]">–</span>}
          {opp && <span className="max-w-[7rem] truncate text-sm font-bold text-[var(--color-text-secondary)]">{opp.display_name}</span>}
          {opp && <span className="text-4xl font-black tabular-nums" style={{ color: !iLead && myTotal !== oppTotal ? "var(--color-warm)" : "var(--color-text-primary)" }}>{oppTotal}</span>}
        </div>
        <div className="w-full max-w-md space-y-2">
          {players.map((p) => {
            const h = hunt[p.id];
            const top = h?.words?.[0];
            return (
              <div key={p.id} className="flex items-center justify-between rounded-[var(--radius-card)] border px-3.5 py-2.5" style={{ borderColor: `${colorFor(p.id)}66` }}>
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorFor(p.id) }} />
                  {p.id === meId ? "you" : p.display_name}
                  <span className="truncate text-[var(--color-text-secondary)]">· {h?.count ?? 0} words{top ? ` · ${top}` : ""}</span>
                </span>
                <span className="font-[var(--font-display)] text-lg font-bold text-[var(--color-success)]">+{h?.points ?? 0}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-4 px-5 py-3">
      {/* live head-to-head scoreboard */}
      <div className="flex w-full max-w-md items-center justify-between gap-3">
        <div className="flex flex-col items-start">
          <span className="font-[var(--font-mono)] text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">You</span>
          <span className="font-[var(--font-display)] text-2xl font-black tabular-nums" style={{ color: meId ? colorFor(meId) : P_COLOR[0] }}>{(meId && roundScores[meId]) || 0}</span>
        </div>
        <span className="min-h-[16px] flex-1 text-center font-[var(--font-mono)] text-[11px] uppercase tracking-widest" style={{ color: rejected ? "var(--color-warm)" : "var(--color-text-secondary)" }}>
          {rejected ? `${lastTried} · no` : "make every word"}
        </span>
        <div className="flex flex-col items-end">
          <span className="max-w-[6rem] truncate font-[var(--font-mono)] text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">{opp?.display_name ?? "Rival"}</span>
          <span className="font-[var(--font-display)] text-2xl font-black tabular-nums" style={{ color: opp ? colorFor(opp.id) : P_COLOR[1] }}>{(opp && roundScores[opp.id]) || 0}</span>
        </div>
      </div>

      {/* Built word display */}
      <div className="flex items-center justify-center min-h-[52px] w-full max-w-md">
        <div className="flex items-center justify-center gap-1.5 min-h-[52px] min-w-[220px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/80 px-4 py-2 shadow-inner">
          <AnimatePresence mode="popLayout">
            {built.length === 0 ? (
              <span className="font-[var(--font-display)] text-xl text-[var(--color-text-secondary)]">tap letters…</span>
            ) : (
              built.map((i, k) => (
                <motion.button
                  key={`${k}-${roundData.letters[i]}`}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => removeAt(k)}
                  className="flex h-10 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)] font-[var(--font-display)] text-lg font-bold text-white shadow-[0_2px_8px_var(--color-primary-glow)]"
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
              disabled={isUsed}
              onClick={() => tap(i)}
              className={`flex h-13 w-11 items-center justify-center rounded-[var(--radius-card)] border font-[var(--font-display)] text-2xl font-bold transition-all ${
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

      {/* Controls: add-word (accumulate) + backspace + clear */}
      <div className="flex w-full max-w-md items-center gap-2">
        <div className="flex-1">
          <Button full onClick={submit} disabled={word.length < MIN_LEN} className="h-12 text-base font-bold shadow-md">
            {word.length < MIN_LEN ? `Min ${MIN_LEN} letters` : `Add "${word}" (+${word.length})`}
          </Button>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <motion.button
            whileTap={{ scale: 0.92 }}
            disabled={!built.length}
            onClick={backspace}
            aria-label="Delete last letter"
            className="flex h-12 w-11 items-center justify-center rounded-2xl border-2 border-[#ff453a] bg-[#ff453a]/20 font-[var(--font-display)] text-xl font-bold text-[#ff453a] transition-all active:scale-95 disabled:opacity-25 disabled:border-[var(--color-border)] disabled:bg-[var(--color-surface)] disabled:text-[var(--color-text-secondary)]"
            title="Delete last letter"
          >
            ⌫
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.92 }}
            disabled={!built.length}
            onClick={clear}
            className="flex h-12 px-3 items-center justify-center rounded-2xl border-2 border-[var(--color-warm)] bg-[var(--color-warm)]/20 font-[var(--font-mono)] text-xs font-bold uppercase tracking-wider text-[var(--color-warm)] transition-all active:scale-95 disabled:opacity-25 disabled:border-[var(--color-border)] disabled:bg-[var(--color-surface)] disabled:text-[var(--color-text-secondary)]"
            title="Clear all letters"
          >
            clear
          </motion.button>
        </div>
      </div>

      {/* Found words this round */}
      <div className="flex max-h-16 w-full max-w-md flex-wrap content-start justify-center gap-1.5 overflow-y-auto">
        {soloWords.map((w) => (
          <span key={w} className="rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 font-[var(--font-mono)] text-xs">
            {w}
            <span className="ml-1 text-[var(--color-success)]">+{w.length}</span>
          </span>
        ))}
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
