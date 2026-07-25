"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { BoardState, PlayerSlot } from "@/lib/types";

interface Props {
  board: BoardState | null;
  meId?: string;
  players?: PlayerSlot[];
  onAction: (data: Record<string, unknown>) => void;
}

const YOU = "#ffd166"; // gold seeds, warm - matches Mancala's hub accent
const OPP = "#8b7cff"; // violet
const STORE_A = 6;
const STORE_B = 13;

/** The pit indices a player owns, and their store, in sowing order. */
function sidesFor(order: string[], me: string) {
  const iAm0 = order[0] === me;
  const myPits = iAm0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12];
  const oppPits = iAm0 ? [7, 8, 9, 10, 11, 12] : [0, 1, 2, 3, 4, 5];
  return {
    myPits, // bottom row, left -> right in sowing order
    myStore: iAm0 ? STORE_A : STORE_B,
    // Opponent pits laid out ABOVE mine so a capture-opposite sits directly over
    // its target (pit i opposite = 12 - i).
    oppTop: myPits.map((i) => 12 - i),
    oppStore: iAm0 ? STORE_B : STORE_A,
  };
}

export function Mancala({ board, meId, players = [], onAction }: Props) {
  // Pulse pits whose seed count changed, and bump a store when it gains.
  const prev = useRef<number[] | null>(null);
  const [changed, setChanged] = useState<Set<number>>(() => new Set());
  const [gen, setGen] = useState(0);

  useEffect(() => {
    if (!board?.pits) return;
    const p = prev.current;
    if (p && p.length === board.pits.length) {
      const s = new Set<number>();
      for (let i = 0; i < board.pits.length; i++) if (p[i] !== board.pits[i]) s.add(i);
      if (s.size) {
        setChanged(s);
        setGen((g) => g + 1);
      }
    }
    prev.current = board.pits.slice();
  }, [board]);

  const order = board?.order ?? [];
  const me = meId && order.includes(meId) ? meId : order[0] ?? "";
  const sides = useMemo(() => sidesFor(order, me), [order, me]);

  if (!board || !board.pits) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center font-[var(--font-display)] text-2xl text-[var(--color-text-secondary)]">
        setting the board...
      </div>
    );
  }

  const pits = board.pits;
  const opp = order.find((id) => id !== me) ?? order[1];
  const oppName = opp === "ai" ? "Caver" : players.find((p) => p.id === opp)?.display_name ?? "opponent";
  const myTurn = board.turn === me;
  const over = !!board.done;
  const captured = new Set(board.captured ?? []);

  const myScore = pits[sides.myStore];
  const oppScore = pits[sides.oppStore];

  const play = (pit: number) => {
    if (!myTurn || over || pits[pit] === 0) return;
    onAction({ pit });
  };

  const banner = over
    ? board.winner === me
      ? "You win"
      : board.winner === opp
        ? `${oppName} wins`
        : "A dead heat"
    : myTurn
      ? board.extra
        ? "Again! Your move"
        : "Your move"
      : `${oppName} is sowing`;

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
      {/* Opponent */}
      <header className="flex items-center justify-between py-3">
        <PlayerTag name={oppName} color={OPP} active={!myTurn && !over} />
        <div className="text-center font-[var(--font-mono)] text-[11px] uppercase tracking-[0.16em]"
             style={{ color: over ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}>
          {banner}
        </div>
        <div className="w-[76px]" />
      </header>

      <div className="flex flex-1 flex-col justify-center gap-3">
        {/* The board: opponent's store on the left, yours on the right, the two
            rows of pits between, your row on the bottom facing you. */}
        <div
          className="flex items-stretch gap-2 rounded-[20px] border p-3"
          style={{ borderColor: "var(--color-border)", background: "#141824" }}
        >
          <Store seeds={oppScore} color={OPP} label={oppName} gen={gen} />

          <div className="flex flex-1 flex-col gap-2.5">
            {/* Opponent row (not tappable), left->right mirrors your row below */}
            <div className="grid grid-cols-6 gap-1.5">
              {sides.oppTop.map((i) => (
                <Pit key={i} seeds={pits[i]} color={OPP} tappable={false}
                     pulse={changed.has(i)} captured={captured.has(i)} gen={gen} />
              ))}
            </div>
            {/* Your row (tappable on your turn) */}
            <div className="grid grid-cols-6 gap-1.5">
              {sides.myPits.map((i) => {
                const canPlay = myTurn && !over && pits[i] > 0;
                return (
                  <Pit key={i} seeds={pits[i]} color={YOU} tappable={canPlay}
                       pulse={changed.has(i)} captured={captured.has(i)} gen={gen}
                       onTap={() => play(i)} />
                );
              })}
            </div>
          </div>

          <Store seeds={myScore} color={YOU} label="you" gen={gen} mine />
        </div>

        <p className="text-center text-xs text-[var(--color-text-secondary)]">
          tap one of your pits · sow counterclockwise · land in your store to go again
        </p>
      </div>

      {/* You */}
      <footer className="flex items-center justify-between py-3">
        <PlayerTag name="You" color={YOU} active={myTurn && !over} />
        <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
          {myScore} - {oppScore}
        </div>
        <div className="w-[76px]" />
      </footer>
    </main>
  );
}

function Pit({
  seeds,
  color,
  tappable,
  pulse,
  captured,
  gen,
  onTap,
}: {
  seeds: number;
  color: string;
  tappable: boolean;
  pulse: boolean;
  captured: boolean;
  gen: number;
  onTap?: () => void;
}) {
  return (
    <button
      onClick={onTap}
      disabled={!tappable}
      className="relative flex aspect-square w-full items-center justify-center rounded-full border transition-colors"
      style={{
        borderColor: tappable ? color : "var(--color-border)",
        background: tappable ? `${color}1f` : "#0c0e16",
        boxShadow: tappable ? `0 0 14px ${color}44` : "inset 0 1px 3px rgba(0,0,0,0.6)",
        cursor: tappable ? "pointer" : "default",
      }}
    >
      {captured && (
        <motion.span
          key={`cap-${gen}`}
          className="absolute inset-0 rounded-full"
          initial={{ opacity: 0.9, scale: 1 }}
          animate={{ opacity: 0, scale: 1.4 }}
          transition={{ duration: 0.6 }}
          style={{ boxShadow: `0 0 0 2px ${color}, 0 0 18px ${color}` }}
        />
      )}
      <motion.span
        key={`${gen}-${seeds}`}
        initial={pulse ? { scale: 0.6 } : false}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 22 }}
        className="font-[var(--font-display)] text-base font-bold tabular-nums"
        style={{ color: seeds ? "var(--color-text-primary)" : "var(--color-text-secondary)", opacity: seeds ? 1 : 0.4 }}
      >
        {seeds}
      </motion.span>
    </button>
  );
}

function Store({
  seeds,
  color,
  label,
  gen,
  mine,
}: {
  seeds: number;
  color: string;
  label: string;
  gen: number;
  mine?: boolean;
}) {
  return (
    <div
      className="flex w-[52px] shrink-0 flex-col items-center justify-center rounded-[16px] border"
      style={{
        borderColor: `color-mix(in srgb, ${color} ${mine ? "55%" : "35%"}, transparent)`,
        background: `linear-gradient(180deg, ${color}1a, transparent)`,
      }}
    >
      <motion.span
        key={`${gen}-${seeds}`}
        initial={{ scale: 0.7 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 480, damping: 20 }}
        className="font-[var(--font-display)] text-2xl font-bold tabular-nums"
        style={{ color }}
      >
        {seeds}
      </motion.span>
      <span className="mt-0.5 max-w-full truncate px-1 font-[var(--font-mono)] text-[9px] uppercase tracking-wide text-[var(--color-text-secondary)]">
        {label}
      </span>
    </div>
  );
}

function PlayerTag({ name, color, active }: { name: string; color: string; active: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-7 w-7 rounded-full"
        style={{ background: color, outline: active ? "2px solid var(--color-text-primary)" : "none", outlineOffset: 2 }}
      />
      <span className="max-w-[90px] truncate font-[var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
        {name}
      </span>
    </div>
  );
}
