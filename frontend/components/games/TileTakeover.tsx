"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { BoardState, PlayerSlot } from "@/lib/types";

interface Props {
  board: BoardState | null;
  meId?: string;
  players?: PlayerSlot[];
  onAction: (data: Record<string, unknown>) => void;
}

// Six vibrant tile colors, indexed to match the server's color indices.
const PALETTE = ["#FF5C5C", "#5C8BFF", "#4FFFB0", "#FFE45C", "#B96CFF", "#FF9B5C"];

export function TileTakeover({ board, meId, players = [], onAction }: Props) {
  // First-timer explainer: shown once (remembered), reopenable via "how to play".
  const [showIntro, setShowIntro] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("skycave_tt_intro")) {
      setShowIntro(true);
    }
  }, []);
  const dismissIntro = () => {
    setShowIntro(false);
    try {
      localStorage.setItem("skycave_tt_intro", "1");
    } catch {
      /* private mode; fine */
    }
  };

  // Flash the tiles captured on each move (yours and the AI's) so the takeover
  // is visible instead of the board silently recolouring. Diff owner-by-owner
  // against the previous board; `gen` re-fires the flash on every new move.
  const prevOwner = useRef<(string | null)[] | null>(null);
  const [captured, setCaptured] = useState<Set<number>>(() => new Set());
  const [gen, setGen] = useState(0);
  useEffect(() => {
    if (!board) return;
    const prev = prevOwner.current;
    if (prev && prev.length === board.owner.length) {
      const s = new Set<number>();
      for (let i = 0; i < board.owner.length; i++) {
        if (prev[i] !== board.owner[i]) s.add(i);
      }
      if (s.size) {
        setCaptured(s);
        setGen((g) => g + 1);
      }
    }
    prevOwner.current = board.owner.slice();
  }, [board]);

  if (!board) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center font-[var(--font-display)] text-2xl text-[var(--color-text-secondary)]">
        setting the board...
      </div>
    );
  }

  const me = meId && board.order.includes(meId) ? meId : board.order[0];
  const opp = board.order.find((id) => id !== me) ?? board.order[1];
  const myColor = board.pcolor[me];
  const oppColor = board.pcolor[opp];
  const myTurn = board.turn === me;
  const oppName =
    opp === "ai"
      ? "Caver"
      : players.find((p) => p.id === opp)?.display_name ?? "opponent";

  const pick = (color: number) => {
    if (!myTurn || color === myColor || color === oppColor) return;
    onAction({ color });
  };

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-center px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
      {/* Tallies + whose turn */}
      <header className="flex w-full items-center justify-between py-4">
        <Tally color={PALETTE[myColor]} count={board.scores[me] ?? 0} label="you" active={myTurn} />
        <div className="text-center font-[var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
          {myTurn ? "your move" : `${oppName} is thinking`}
        </div>
        <Tally color={PALETTE[oppColor]} count={board.scores[opp] ?? 0} label={oppName} active={!myTurn} align="right" />
      </header>

      {/* Board */}
      <div
        className="grid w-full max-w-[336px] gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${board.cols}, 1fr)` }}
      >
        {board.tiles.map((c, i) => (
          <div
            key={i}
            className="relative aspect-square rounded-[4px]"
            style={{ background: PALETTE[c] }}
          >
            <AnimatePresence>
              {captured.has(i) && (
                <motion.div
                  key={gen}
                  initial={{ opacity: 0.85, scale: 0.45 }}
                  animate={{ opacity: 0, scale: 1 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="pointer-events-none absolute inset-0 rounded-[4px]"
                  style={{ background: "rgba(255,255,255,0.6)" }}
                />
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* Hint + color picker */}
      <div className="mt-auto w-full pt-6">
        <p className="mb-3 text-center text-xs text-[var(--color-text-secondary)]">
          tap a color to flood your side · most tiles wins ·{" "}
          <button onClick={() => setShowIntro(true)} className="underline underline-offset-2">
            how to play
          </button>
        </p>
        <div className="flex w-full items-center justify-center gap-2.5">
          {PALETTE.map((hex, i) => {
            const taken = i === myColor || i === oppColor;
            const disabled = !myTurn || taken;
            return (
              <motion.button
                key={i}
                whileTap={disabled ? undefined : { scale: 0.88 }}
                disabled={disabled}
                onClick={() => pick(i)}
                aria-label={`color ${i + 1}`}
                className="h-12 w-12 rounded-full border-2 transition-opacity sm:h-14 sm:w-14"
                style={{
                  background: hex,
                  borderColor: i === myColor ? "var(--color-text-primary)" : "transparent",
                  opacity: disabled ? (taken ? 0.28 : 0.5) : 1,
                }}
              />
            );
          })}
        </div>
      </div>

      {/* First-timer explainer */}
      <AnimatePresence>
        {showIntro && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismissIntro}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 pb-8 sm:items-center"
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-[20px] border border-[var(--color-border)] bg-[var(--color-elevated)] p-6"
            >
              <h2 className="font-[var(--font-display)] text-xl font-bold">How to play</h2>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                <li>
                  <span className="text-[var(--color-text-primary)]">You own one corner, the other player owns the opposite one.</span>
                </li>
                <li>Tap a color below. Your whole area turns that color and grabs every touching tile of it.</li>
                <li>You can't pick your current color or your opponent's (those two are dimmed).</li>
                <li>When the board fills up, whoever owns the most tiles wins.</li>
              </ul>
              <button
                onClick={dismissIntro}
                style={{ backgroundColor: "var(--color-primary)", color: "#05060a" }}
                className="mt-6 h-12 w-full rounded-[var(--radius-button)] text-sm font-semibold"
              >
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function Tally({
  color,
  count,
  label,
  active,
  align = "left",
}: {
  color: string;
  count: number;
  label: string;
  active: boolean;
  align?: "left" | "right";
}) {
  return (
    <div className={`flex items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <span
        className="h-8 w-8 rounded-[8px]"
        style={{ background: color, outline: active ? "2px solid var(--color-text-primary)" : "none", outlineOffset: 2 }}
      />
      <div className={align === "right" ? "items-end" : ""}>
        <div className="font-[var(--font-display)] text-xl font-bold leading-none tabular-nums">{count}</div>
        <div className="max-w-[80px] truncate font-[var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
          {label}
        </div>
      </div>
    </div>
  );
}
