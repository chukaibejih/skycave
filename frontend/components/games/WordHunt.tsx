"use client";
import { useEffect, useRef, useState } from "react";
import { useRoom, type RoundResult } from "@/lib/store";
import type { PlayerSlot } from "@/lib/types";

interface RoundData {
  grid: string[];
  cols: number;
  round_time: number;
}

interface HuntInfo {
  words: string[]; // the longest words found (for the reveal)
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

const MIN = 3;
const COLS = 4;
const CELL = 68;
const GAP = 8;
const SIZE = COLS * CELL + (COLS - 1) * GAP;
const P_COLOR = ["#6C63FF", "#FF6B6B"];

// Client-side mirror of the backend Boggle score curve (for display only; the
// server is authoritative).
const pts = (n: number) => (n <= 4 ? 1 : n === 5 ? 2 : n === 6 ? 3 : n === 7 ? 5 : 11);

const center = (i: number) => {
  const r = Math.floor(i / COLS);
  const c = i % COLS;
  return { x: c * (CELL + GAP) + CELL / 2, y: r * (CELL + GAP) + CELL / 2 };
};
const adjacent = (a: number, b: number) => {
  const ra = Math.floor(a / COLS), ca = a % COLS;
  const rb = Math.floor(b / COLS), cb = b % COLS;
  return a !== b && Math.abs(ra - rb) <= 1 && Math.abs(ca - cb) <= 1;
};

/** Drag across adjacent cells to build a word; release to submit it. */
function TraceGrid({
  grid,
  disabled,
  onSubmit,
}: {
  grid: string[];
  disabled?: boolean;
  onSubmit: (word: string) => void;
}) {
  const [path, setPath] = useState<number[]>([]);
  const pathRef = useRef<number[]>([]); // source of truth read synchronously by handlers
  const dragging = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  // Keep ref + state in lockstep; never mutate state inside a setState updater.
  const commit = (next: number[]) => {
    pathRef.current = next;
    setPath(next);
  };

  const cellAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y);
    const cell = (el as HTMLElement | null)?.closest?.("[data-idx]") as HTMLElement | null;
    if (!cell || !ref.current?.contains(cell)) return null;
    return Number(cell.dataset.idx);
  };

  const extend = (idx: number | null) => {
    if (idx == null) return;
    const p = pathRef.current;
    if (p.length === 0) return commit([idx]);
    const last = p[p.length - 1];
    if (idx === last) return;
    if (p.length >= 2 && idx === p[p.length - 2]) return commit(p.slice(0, -1)); // backtrack
    if (!p.includes(idx) && adjacent(last, idx)) commit([...p, idx]);
  };

  const down = (e: React.PointerEvent) => {
    if (disabled) return;
    ref.current?.setPointerCapture(e.pointerId); // keep receiving move/up outside the grid
    dragging.current = true;
    commit([]);
    extend(cellAt(e.clientX, e.clientY));
  };
  const move = (e: React.PointerEvent) => {
    if (dragging.current && !disabled) extend(cellAt(e.clientX, e.clientY));
  };
  const up = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const w = pathRef.current.map((i) => grid[i]).join("");
    commit([]);
    if (w.length >= MIN) onSubmit(w); // event handler, not render - safe
  };

  const word = path.map((i) => grid[i]).join("");

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex min-h-[34px] items-center font-[var(--font-display)] text-2xl font-bold tracking-[0.12em]">
        {word || <span className="text-[var(--color-text-secondary)] tracking-normal">drag to trace</span>}
      </div>
      <div
        ref={ref}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        style={{
          width: SIZE,
          height: SIZE,
          position: "relative",
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <svg width={SIZE} height={SIZE} className="pointer-events-none absolute inset-0">
          {path.length > 1 && (
            <polyline
              points={path.map((i) => { const c = center(i); return `${c.x},${c.y}`; }).join(" ")}
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth={7}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.5}
            />
          )}
        </svg>
        <div
          className="absolute inset-0 grid"
          style={{ gridTemplateColumns: `repeat(${COLS}, ${CELL}px)`, gap: GAP }}
        >
          {grid.map((l, i) => {
            const on = path.includes(i);
            return (
              <div
                key={i}
                data-idx={i}
                className="flex items-center justify-center rounded-[14px] border font-[var(--font-display)] text-2xl font-bold"
                style={{
                  width: CELL,
                  height: CELL,
                  color: "var(--color-text-primary)",
                  borderColor: on ? "var(--color-primary)" : "var(--color-border)",
                  background: on
                    ? "color-mix(in srgb, var(--color-primary) 24%, var(--color-elevated))"
                    : "var(--color-elevated)",
                }}
              >
                {l}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ScorePill({ label, value, color, right }: { label: string; value: number; color: string; right?: boolean }) {
  return (
    <div className={`flex flex-col ${right ? "items-end" : "items-start"}`}>
      <span className="flex items-center gap-1.5 font-[var(--font-mono)] text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
        {!right && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
        <span className="max-w-[6rem] truncate">{label}</span>
        {right && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
      </span>
      <span className="font-[var(--font-display)] text-2xl font-black tabular-nums" style={{ color }}>{value}</span>
    </div>
  );
}

export function WordHunt({
  roundData,
  phase,
  result,
  onAction,
  players = [],
  meId,
  solo,
}: Props) {
  const active = phase === "active";
  const soloWords = useRoom((s) => s.soloWords);
  const feedback = useRoom((s) => s.feedback);
  const roundScores = useRoom((s) => s.roundScores);
  const [lastTried, setLastTried] = useState<string | null>(null);
  useEffect(() => setLastTried(null), [roundData.grid]);

  if (solo) return <SoloWordHunt grid={roundData.grid} onAction={onAction} />;

  // 1v1 is a head-to-head hunt: both work the same grid the whole round, every
  // valid word accumulates, higher total wins. Same accumulation state as solo.
  const colorFor = (pid: string) => P_COLOR[players.findIndex((p) => p.id === pid)] ?? "#9aa3ba";
  const opp = players.find((p) => p.id !== meId);
  const rejected = feedback === "wrong" && lastTried !== null && !soloWords.includes(lastTried);

  if (!active) {
    const hunt = (result?.answer as { hunt?: Record<string, HuntInfo> })?.hunt ?? {};
    const totals = (result as unknown as { scores?: Record<string, number> })?.scores ?? {};
    const myTotal = meId ? totals[meId] ?? 0 : 0;
    const oppTotal = opp ? totals[opp.id] ?? 0 : 0;
    const iLead = myTotal > oppTotal;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-5">
        {/* the match total race */}
        <div className="flex items-center gap-3 font-[var(--font-display)] tracking-tight">
          <span className="text-4xl font-black tabular-nums" style={{ color: iLead ? "var(--color-success)" : "var(--color-text-primary)" }}>{myTotal}</span>
          <span className="text-sm font-bold text-[var(--color-text-secondary)]">You</span>
          {opp && <span className="text-lg font-bold text-[var(--color-text-secondary)]">–</span>}
          {opp && <span className="max-w-[7rem] truncate text-sm font-bold text-[var(--color-text-secondary)]">{opp.display_name}</span>}
          {opp && <span className="text-4xl font-black tabular-nums" style={{ color: !iLead && myTotal !== oppTotal ? "var(--color-warm)" : "var(--color-text-primary)" }}>{oppTotal}</span>}
        </div>
        <div className="mb-1 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-secondary)]">this grid</div>
        <div className="w-full max-w-md space-y-2">
          {players.map((p) => {
            const h = hunt[p.id];
            const top = h?.words?.[0];
            return (
              <div key={p.id} className="flex items-center justify-between rounded-[var(--radius-card)] border px-3 py-2" style={{ borderColor: `${colorFor(p.id)}66` }}>
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorFor(p.id) }} />
                  {p.id === meId ? "you" : p.display_name}
                  <span className="truncate text-[var(--color-text-secondary)]">
                    · {h?.count ?? 0} words{top ? ` · ${top}` : ""}
                  </span>
                </span>
                <span className="font-[var(--font-display)] text-lg font-bold" style={{ color: "var(--color-success)" }}>+{h?.points ?? 0}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5">
      {/* live head-to-head scoreboard */}
      <div className="flex w-full max-w-md items-center justify-between gap-3">
        <ScorePill label="You" value={(meId && roundScores[meId]) || 0} color={meId ? colorFor(meId) : P_COLOR[0]} />
        <span className="min-h-[16px] flex-1 text-center font-[var(--font-mono)] text-[11px] uppercase tracking-widest" style={{ color: rejected ? "var(--color-warm)" : "var(--color-text-secondary)" }}>
          {rejected ? `${lastTried} · no` : "trace every word"}
        </span>
        <ScorePill label={opp?.display_name ?? "Rival"} value={(opp && roundScores[opp.id]) || 0} color={opp ? colorFor(opp.id) : P_COLOR[1]} right />
      </div>
      <TraceGrid
        grid={roundData.grid}
        onSubmit={(w) => {
          onAction({ word: w });
          setLastTried(w);
        }}
      />
      <div className="flex max-h-20 w-full max-w-md flex-wrap content-start justify-center gap-1.5 overflow-y-auto">
        {soloWords.map((w) => (
          <span key={w} className="rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 font-[var(--font-mono)] text-xs">
            {w}
            <span className="ml-1 text-[var(--color-success)]">+{pts(w.length)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function SoloWordHunt({
  grid,
  onAction,
}: {
  grid: string[];
  onAction: (data: Record<string, unknown>) => void;
}) {
  const soloWords = useRoom((s) => s.soloWords);
  const feedback = useRoom((s) => s.feedback);
  const [lastTried, setLastTried] = useState<string | null>(null);
  useEffect(() => setLastTried(null), [grid]);

  const rejected =
    feedback === "wrong" && lastTried !== null && !soloWords.includes(lastTried);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-5">
      <p className="min-h-[20px] text-sm text-[var(--color-text-secondary)]">
        {rejected ? `${lastTried} · not valid` : `Find as many words as you can. Min ${MIN}.`}
      </p>
      <TraceGrid
        grid={grid}
        onSubmit={(w) => {
          onAction({ word: w });
          setLastTried(w);
        }}
      />
      <div className="flex max-h-24 w-full max-w-md flex-wrap content-start justify-center gap-1.5 overflow-y-auto">
        {soloWords.map((w) => (
          <span
            key={w}
            className="rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 font-[var(--font-mono)] text-xs"
          >
            {w}
            <span className="ml-1 text-[var(--color-success)]">+{pts(w.length)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
