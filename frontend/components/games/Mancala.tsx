"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimate } from "framer-motion";
import type { BoardState, PlayerSlot } from "@/lib/types";

interface Props {
  board: BoardState | null;
  meId?: string;
  players?: PlayerSlot[];
  onAction: (data: Record<string, unknown>) => void;
}

// Seeds are pale ivory beads, the same for both sides (as on a real board);
// which side a pit is on tells you whose it is. Ivory keeps the seeds clearly
// distinct from the gold rim on your side, which otherwise washed together.
const SEED = "#f2e8d0";
const SEED_DARK = "#cbb98f";
const YOU = "#ffd166"; // your side rim (gold - Mancala's hub accent)
const OPP = "#8b7cff"; // opponent side rim (violet)
const STORE_A = 6;
const STORE_B = 13;
const HOP_MS = 210; // per-seed travel time - slow enough to follow by eye

function sidesFor(order: string[], me: string) {
  const iAm0 = order[0] === me;
  const myPits = iAm0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12];
  return {
    myPits, // bottom row, left -> right in sowing order
    myStore: iAm0 ? STORE_A : STORE_B,
    oppTop: myPits.map((i) => 12 - i), // opp pits laid out above their capture-target
    oppStore: iAm0 ? STORE_B : STORE_A,
    iAm0,
  };
}

// Deterministic scatter so a pit's beads don't jump around on every render.
const SCATTER = [
  [50, 50], [32, 38], [68, 40], [40, 66], [63, 64], [50, 28],
  [28, 58], [72, 60], [38, 46], [62, 46], [50, 72], [30, 72],
  [70, 72], [22, 44], [78, 46], [50, 40],
];

/** Sow path: the pits that receive a seed, in order, from `fromPit`. */
function sowPath(fromPit: number, seeds: number, oppStore: number): number[] {
  const path: number[] = [];
  let i = fromPit;
  while (seeds > 0) {
    i = (i + 1) % 14;
    if (i === oppStore) continue;
    path.push(i);
    seeds -= 1;
  }
  return path;
}

export function Mancala({ board, meId, players = [], onAction }: Props) {
  const order = board?.order ?? [];
  const me = meId && order.includes(meId) ? meId : order[0] ?? "";
  const sides = useMemo(() => sidesFor(order, me), [order, me]);

  // What is drawn. Diverges from the server board only while a sow plays out,
  // then reconciles exactly. Board updates are queued and played one at a time,
  // so the opponent's move never lands on top of yours still mid-flight - each
  // sow finishes, settles, then the next begins.
  const [display, setDisplay] = useState<number[]>(board?.pits ?? Array(14).fill(0));
  const displayRef = useRef<number[]>(board?.pits ?? Array(14).fill(0));
  const [animating, setAnimating] = useState(false);
  const [sowingActor, setSowingActor] = useState<string | null>(null);
  const queue = useRef<{ pits: number[]; from: number | null }[]>([]);
  const pumping = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const pitRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [flyer, animate] = useAnimate();
  const [flyOn, setFlyOn] = useState(false);

  const paint = (pits: number[]) => {
    displayRef.current = pits;
    setDisplay(pits);
  };

  const center = (i: number) => {
    const el = pitRefs.current[i];
    const b = boardRef.current;
    if (!el || !b) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const bb = b.getBoundingClientRect();
    return { x: r.left - bb.left + r.width / 2, y: r.top - bb.top + r.height / 2 };
  };

  useEffect(() => {
    if (!board?.pits) return;
    queue.current.push({ pits: board.pits.slice(), from: board.last_pit ?? null });
    if (pumping.current) return;

    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const playStep = async (step: { pits: number[]; from: number | null }) => {
      const prev = displayRef.current;
      const target = step.pits;
      // First paint, or a state we can't replay: just show it.
      if (step.from == null || prev.length !== 14 || prev[step.from] <= 0) {
        paint(target.slice());
        return;
      }
      const from = step.from;
      const seeds = prev[from];
      const moverIsO = from >= 0 && from <= 5;
      const skipStore = moverIsO ? STORE_B : STORE_A;
      setSowingActor(moverIsO ? order[0] : order[1]);
      const path = sowPath(from, seeds, skipStore);

      const work = prev.slice();
      work[from] = 0;
      paint(work.slice());

      const start = center(from);
      await animate(flyer.current, { x: start.x, y: start.y, opacity: 0, scale: 0.6 }, { duration: 0 });
      setFlyOn(true);
      await animate(flyer.current, { opacity: 1, scale: 1 }, { duration: 0.12 });
      for (const pit of path) {
        const c = center(pit);
        await animate(flyer.current, { x: c.x, y: c.y }, { duration: HOP_MS / 1000, ease: "easeInOut" });
        work[pit] += 1;
        paint(work.slice());
      }
      setFlyOn(false);
      // Reconcile to the server's exact board (captures + end sweep).
      paint(target.slice());
    };

    (async () => {
      pumping.current = true;
      setAnimating(true);
      while (queue.current.length) {
        const step = queue.current.shift()!;
        await playStep(step);
        if (queue.current.length) await wait(420); // a beat between moves
      }
      setSowingActor(null);
      setAnimating(false);
      pumping.current = false;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);

  if (!board || !board.pits) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center font-[var(--font-display)] text-2xl text-[var(--color-text-secondary)]">
        setting the board...
      </div>
    );
  }

  const opp = order.find((id) => id !== me) ?? order[1];
  const oppName = opp === "ai" ? "Caver" : players.find((p) => p.id === opp)?.display_name ?? "opponent";
  const myTurn = board.turn === me && !animating;
  const over = !!board.done;
  const captured = new Set(board.captured ?? []);
  const myScore = display[sides.myStore];
  const oppScore = display[sides.oppStore];

  const play = (pit: number) => {
    if (!myTurn || over || display[pit] === 0) return;
    onAction({ pit });
  };

  const banner = over
    ? board.winner === me
      ? "You win"
      : board.winner === opp
        ? `${oppName} wins`
        : "A dead heat"
    : animating && sowingActor === opp
      ? `${oppName} is sowing`
      : animating && sowingActor === me
        ? "sowing..."
        : board.turn === me
          ? board.extra
            ? "Again! your move"
            : "Your move"
          : `${oppName} is thinking`;

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-3 pb-[max(env(safe-area-inset-bottom),16px)]">
      <header className="flex items-center justify-between py-3">
        <PlayerTag name={oppName} color={OPP} active={board.turn === opp && !over} />
        <div className="text-center font-[var(--font-mono)] text-[11px] uppercase tracking-[0.16em]"
             style={{ color: over ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}>
          {banner}
        </div>
        <div className="w-[72px]" />
      </header>

      <div className="flex flex-1 flex-col justify-center">
        {/* The board: a carved panel, a store at each end, two rows of scooped
            pits between. Your row is the bottom, facing you. */}
        <div
          ref={boardRef}
          className="relative flex items-stretch gap-2.5 rounded-[28px] p-3"
          style={{
            background: "linear-gradient(160deg, #3a2a1a, #241a10 60%, #1c140c)",
            boxShadow: "inset 0 1px 0 rgba(255,220,160,0.12), 0 10px 30px rgba(0,0,0,0.45)",
            border: "1px solid rgba(120,90,55,0.5)",
          }}
        >
          <Store
            seeds={oppScore}
            color={OPP}
            label={oppName}
            innerRef={(el) => (pitRefs.current[sides.oppStore] = el)}
            captured={captured.has(sides.oppStore)}
          />

          <div className="flex flex-1 flex-col justify-center gap-3">
            <div className="grid grid-cols-6 gap-2">
              {sides.oppTop.map((i) => (
                <Pit
                  key={i}
                  seeds={display[i]}
                  rim={OPP}
                  tappable={false}
                  captured={captured.has(i)}
                  innerRef={(el) => (pitRefs.current[i] = el)}
                />
              ))}
            </div>
            <div className="grid grid-cols-6 gap-2">
              {sides.myPits.map((i) => (
                <Pit
                  key={i}
                  seeds={display[i]}
                  rim={YOU}
                  tappable={myTurn && !over && display[i] > 0}
                  captured={captured.has(i)}
                  innerRef={(el) => (pitRefs.current[i] = el)}
                  onTap={() => play(i)}
                />
              ))}
            </div>
          </div>

          <Store
            seeds={myScore}
            color={YOU}
            label="you"
            mine
            innerRef={(el) => (pitRefs.current[sides.myStore] = el)}
            captured={captured.has(sides.myStore)}
          />

          {/* The travelling seed, sowing pit to pit. */}
          <motion.div
            ref={flyer}
            className="pointer-events-none absolute left-0 top-0 z-20"
            style={{ opacity: 0 }}
          >
            <span
              className="block h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background: `radial-gradient(circle at 35% 30%, ${SEED}, ${SEED_DARK})`,
                boxShadow: `0 0 10px ${SEED}, 0 2px 3px rgba(0,0,0,0.5)`,
                visibility: flyOn ? "visible" : "hidden",
              }}
            />
          </motion.div>
        </div>

        <p className="mt-3 text-center text-xs text-[var(--color-text-secondary)]">
          tap one of your pits · seeds sow counterclockwise · land in your store to go again
        </p>
      </div>

      <footer className="flex items-center justify-between py-3">
        <PlayerTag name="You" color={YOU} active={board.turn === me && !over} />
        <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
          {myScore} - {oppScore}
        </div>
        <div className="w-[72px]" />
      </footer>
    </main>
  );
}

/** A scooped pit holding scattered seed beads. */
function Pit({
  seeds,
  rim,
  tappable,
  captured,
  innerRef,
  onTap,
}: {
  seeds: number;
  rim: string;
  tappable: boolean;
  captured: boolean;
  innerRef: (el: HTMLDivElement | null) => void;
  onTap?: () => void;
}) {
  const shown = Math.min(seeds, SCATTER.length);
  return (
    <button
      onClick={onTap}
      disabled={!tappable}
      aria-label={`pit with ${seeds} seeds`}
      className="relative aspect-square w-full rounded-full transition-transform active:scale-95"
      style={{
        background: "radial-gradient(circle at 50% 38%, #12100c, #241a10 70%, #2c2013)",
        boxShadow: tappable
          ? `inset 0 3px 8px rgba(0,0,0,0.75), 0 0 0 2px ${rim}, 0 0 16px ${rim}66`
          : `inset 0 3px 8px rgba(0,0,0,0.75), 0 0 0 1px rgba(120,90,55,0.45)`,
        cursor: tappable ? "pointer" : "default",
      }}
    >
      <div ref={innerRef} className="absolute inset-0" />
      <Seeds count={shown} />
      {seeds > SCATTER.length && (
        <span className="absolute bottom-0.5 right-1 font-[var(--font-mono)] text-[9px] font-bold text-[var(--color-text-primary)]">
          {seeds}
        </span>
      )}
      {captured && (
        <motion.span
          className="absolute inset-0 rounded-full"
          initial={{ opacity: 0.85, scale: 1 }}
          animate={{ opacity: 0, scale: 1.35 }}
          transition={{ duration: 0.7 }}
          style={{ boxShadow: `0 0 0 2px ${rim}, 0 0 18px ${rim}` }}
        />
      )}
    </button>
  );
}

/** Scattered beads for a pit, positioned deterministically. */
function Seeds({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, k) => {
        const [x, y] = SCATTER[k];
        return (
          <motion.span
            key={k}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 600, damping: 24 }}
            className="absolute block h-[22%] w-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              background: `radial-gradient(circle at 35% 30%, ${SEED}, ${SEED_DARK})`,
              boxShadow: "0 1px 2px rgba(0,0,0,0.55)",
            }}
          />
        );
      })}
    </>
  );
}

/** The big end bowl, showing its hoard of beads and a count. */
function Store({
  seeds,
  color,
  label,
  mine,
  innerRef,
  captured,
}: {
  seeds: number;
  color: string;
  label: string;
  mine?: boolean;
  innerRef: (el: HTMLDivElement | null) => void;
  captured: boolean;
}) {
  const shown = Math.min(seeds, SCATTER.length);
  return (
    <div
      className="relative flex w-[54px] shrink-0 flex-col items-center justify-end rounded-[22px] pb-2"
      style={{
        background: "radial-gradient(ellipse at 50% 35%, #12100c, #241a10 75%)",
        boxShadow: `inset 0 4px 12px rgba(0,0,0,0.8), 0 0 0 ${mine ? 2 : 1}px ${mine ? color : "rgba(120,90,55,0.5)"}${mine ? "" : ""}`,
      }}
    >
      <div ref={innerRef} className="absolute inset-x-0 top-0 h-2/3">
        <Seeds count={shown} />
      </div>
      <motion.span
        key={seeds}
        initial={{ scale: 0.7 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 480, damping: 18 }}
        className="relative z-10 font-[var(--font-display)] text-2xl font-bold tabular-nums"
        style={{ color }}
      >
        {seeds}
      </motion.span>
      <span className="relative z-10 mt-0.5 max-w-full truncate px-1 font-[var(--font-mono)] text-[9px] uppercase tracking-wide text-[var(--color-text-secondary)]">
        {label}
      </span>
      {captured && (
        <motion.span
          className="absolute inset-0 rounded-[22px]"
          initial={{ opacity: 0.7, scale: 1 }}
          animate={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.7 }}
          style={{ boxShadow: `0 0 0 2px ${color}, 0 0 22px ${color}` }}
        />
      )}
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
      <span className="max-w-[84px] truncate font-[var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
        {name}
      </span>
    </div>
  );
}
