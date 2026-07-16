"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { BoardState, PlayerSlot } from "@/lib/types";
import { AssistToggle, useAssist, useIdleHint } from "./assist";

interface Props {
  board: BoardState | null;
  meId?: string;
  players?: PlayerSlot[];
  onAction: (data: Record<string, unknown>) => void;
}

const YOU = "#8b7cff"; // violet
const OPP = "#ffd166"; // gold
const EMPTY = "#0c0e16";

function dropRow(owner: (string | null)[], col: number, cols: number, rows: number): number | null {
  for (let r = rows - 1; r >= 0; r--) if (owner[r * cols + col] === null) return r;
  return null;
}
function isFour(owner: (string | null)[], r0: number, c0: number, pid: string, cols: number, rows: number): boolean {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]] as const) {
    let n = 1;
    for (const s of [1, -1]) {
      let r = r0 + dr * s;
      let c = c0 + dc * s;
      while (r >= 0 && r < rows && c >= 0 && c < cols && owner[r * cols + c] === pid) {
        n++;
        r += dr * s;
        c += dc * s;
      }
    }
    if (n >= 4) return true;
  }
  return false;
}
// Gentle assist: win if you can, else block a threat, else the most central open column.
function connect4Hint(owner: (string | null)[], cols: number, rows: number, me: string, opp: string): number | null {
  const legal: number[] = [];
  for (let c = 0; c < cols; c++) if (dropRow(owner, c, cols, rows) !== null) legal.push(c);
  if (!legal.length) return null;
  const wins = (col: number, pid: string) => {
    const r = dropRow(owner, col, cols, rows);
    if (r === null) return false;
    const b = owner.slice();
    b[r * cols + col] = pid;
    return isFour(b, r, col, pid, cols, rows);
  };
  for (const c of legal) if (wins(c, me)) return c;
  for (const c of legal) if (wins(c, opp)) return c;
  const mid = Math.floor(cols / 2);
  return legal.reduce((b, c) => (Math.abs(c - mid) < Math.abs(b - mid) ? c : b), legal[0]);
}

export function Connect4({ board, meId, players = [], onAction }: Props) {
  // Animate freshly dropped discs falling in (diff owner vs the previous board).
  const prevOwner = useRef<(string | null)[] | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(() => new Set());
  const [gen, setGen] = useState(0);
  const [assist, setAssist] = useAssist();
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

  // Assist hint from null-guarded inputs so these hooks ALWAYS run. `board` can
  // flip back to null (game end / state reset); an early return sitting above a
  // hook is what crashed the app with React error #310.
  const gOwner = board?.owner ?? null;
  const gCols = board?.cols ?? 0;
  const gRows = board?.rows ?? 0;
  const gOrder = board?.order ?? [];
  const gMe = (meId && gOrder.includes(meId) ? meId : gOrder[0]) ?? "";
  const gOpp = gOrder.find((id) => id !== gMe) ?? gOrder[1] ?? "";
  const gOver = board?.winner != null || (!!gOwner && gOwner.every((o) => o !== null));
  const gActive = assist && gOpp === "ai" && !!board && board.turn === gMe && !gOver;
  const placed = gOwner ? gOwner.filter(Boolean).length : 0;
  const hintCol = useMemo(
    () => (gOwner && gActive ? connect4Hint(gOwner, gCols, gRows, gMe, gOpp) : null),
    [gOwner, gActive, gCols, gRows, gMe, gOpp]
  );
  const showHint = useIdleHint(gActive && hintCol != null, placed);

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
  const isSolo = opp === "ai";
  const myTurn = board.turn === me;
  const winCells = new Set(board.win_cells ?? []);
  const won = board.winner != null;
  const full = owner.every((o) => o !== null);
  const over = won || full;
  const hintRow = hintCol != null ? dropRow(owner, hintCol, cols, rows) : null;

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

      <div className="flex w-full flex-1 flex-col items-center justify-center">
      {/* Board: 7 tappable columns of 6 circular cells */}
      <div className="w-full max-w-[400px] rounded-[16px] border p-3" style={{ borderColor: "var(--color-border)", background: "#141824" }}>
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
                  const isHint = showHint && c === hintCol && r === hintRow;
                  return (
                    <span key={i} className="relative block aspect-square w-full">
                      <span className="absolute inset-0 rounded-full" style={{ background: EMPTY, boxShadow: "inset 0 1px 2px rgba(0,0,0,0.6)" }} />
                      {isHint && (
                        <span
                          className="absolute inset-0 animate-pulse rounded-full"
                          style={{ boxShadow: `inset 0 0 0 2px ${YOU}`, background: "rgba(139,124,255,0.20)" }}
                        />
                      )}
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

      {isSolo && (
        <div className="mt-5 flex justify-center">
          <AssistToggle on={assist} onChange={setAssist} />
        </div>
      )}
      <p className="mt-3 text-center text-xs text-[var(--color-text-secondary)]">
        tap a column to drop your disc · line up four to win
      </p>
      </div>
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
