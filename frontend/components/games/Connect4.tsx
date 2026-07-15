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

const YOU = "#8b7cff"; // violet
const OPP = "#ffd166"; // gold
const EMPTY = "#0c0e16";

export function Connect4({ board, meId, players = [], onAction }: Props) {
  // Animate freshly dropped discs falling in (diff owner vs the previous board).
  const prevOwner = useRef<(string | null)[] | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(() => new Set());
  const [gen, setGen] = useState(0);
  useEffect(() => {
    if (!board) return;
    const prev = prevOwner.current;
    if (prev && prev.length === board.owner.length) {
      const s = new Set<number>();
      for (let i = 0; i < board.owner.length; i++) if (prev[i] !== board.owner[i]) s.add(i);
      if (s.size) {
        setFresh(s);
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

  const { cols, rows, owner } = board;
  const me = meId && board.order.includes(meId) ? meId : board.order[0];
  const opp = board.order.find((id) => id !== me) ?? board.order[1];
  const oppName = opp === "ai" ? "Caver" : players.find((p) => p.id === opp)?.display_name ?? "opponent";
  const myTurn = board.turn === me;
  const winCells = new Set(board.win_cells ?? []);
  const won = board.winner != null;
  const full = owner.every((o) => o !== null);
  const over = won || full;

  const colorFor = (o: string | null) => (o === me ? YOU : o === opp ? OPP : EMPTY);

  const drop = (col: number) => {
    if (!myTurn || over) return;
    if (owner[col] !== null) return; // top cell of the column is filled -> column full
    onAction({ col });
  };

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-center px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
      {/* Turn / players */}
      <header className="flex w-full items-center justify-between py-4">
        <Chip color={YOU} label="you" active={myTurn && !over} />
        <div className="text-center font-[var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
          {over
            ? board.winner === me
              ? "you win"
              : board.winner === opp
              ? `${oppName} wins`
              : "a draw"
            : myTurn
            ? "your move"
            : `${oppName} is thinking`}
        </div>
        <Chip color={OPP} label={oppName} active={!myTurn && !over} align="right" />
      </header>

      {/* Board: 7 tappable columns of 6 circular cells */}
      <div className="w-full max-w-[340px] rounded-[16px] border p-2.5" style={{ borderColor: "var(--color-border)", background: "#141824" }}>
        <div className="flex gap-1.5">
          {Array.from({ length: cols }).map((_, c) => {
            const colFull = owner[c] !== null;
            const canPlay = myTurn && !over && !colFull;
            return (
              <button
                key={c}
                onClick={() => drop(c)}
                disabled={!canPlay}
                aria-label={`drop in column ${c + 1}`}
                className="flex flex-1 flex-col gap-1.5 rounded-[8px] p-0.5 transition-colors"
                style={{ background: canPlay ? "rgba(139,124,255,0.06)" : "transparent" }}
              >
                {Array.from({ length: rows }).map((_, r) => {
                  const i = r * cols + c;
                  const o = owner[i];
                  const isFresh = fresh.has(i);
                  return (
                    <span key={i} className="relative block aspect-square w-full">
                      <span className="absolute inset-0 rounded-full" style={{ background: EMPTY, boxShadow: "inset 0 1px 2px rgba(0,0,0,0.6)" }} />
                      <AnimatePresence>
                        {o && (
                          <motion.span
                            key={`${gen}-${i}`}
                            initial={isFresh ? { y: "-360%", opacity: 0.6 } : false}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 460, damping: 26 }}
                            className="absolute inset-0 rounded-full"
                            style={{
                              background: colorFor(o),
                              boxShadow: winCells.has(i)
                                ? `0 0 0 2px #fff, 0 0 12px ${colorFor(o)}`
                                : `inset 0 2px 3px rgba(255,255,255,0.25), 0 1px 2px rgba(0,0,0,0.5)`,
                            }}
                          />
                        )}
                      </AnimatePresence>
                    </span>
                  );
                })}
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-[var(--color-text-secondary)]">
        tap a column to drop your disc · line up four to win
      </p>
    </main>
  );
}

function Chip({ color, label, active, align = "left" }: { color: string; label: string; active: boolean; align?: "left" | "right" }) {
  return (
    <div className={`flex items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <span className="h-8 w-8 rounded-full" style={{ background: color, outline: active ? "2px solid var(--color-text-primary)" : "none", outlineOffset: 2 }} />
      <div className={align === "right" ? "items-end" : ""}>
        <div className="max-w-[90px] truncate font-[var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">{label}</div>
      </div>
    </div>
  );
}
