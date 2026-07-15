"use client";
import { useMemo } from "react";
import type { BoardState, PlayerSlot } from "@/lib/types";
import { AssistToggle, useAssist, useIdleHint } from "./assist";

interface Props {
  board: BoardState | null;
  meId?: string;
  players?: PlayerSlot[];
  onAction: (data: Record<string, unknown>) => void;
}

const YOU = "#8b7cff"; // violet
const OPP = "#ff725e"; // coral
const S = 10; // dot spacing in viewBox units
const P = 7; // padding

// Gentle assist: take a free box if one is available, else a safe line that gives
// nothing away, else the line that opens the fewest boxes. Returns a flat edge id.
function dotsHint(h: (string | null)[], v: (string | null)[], cols: number, rows: number, numH: number): number | null {
  const hIdx = (r: number, c: number) => r * cols + c;
  const vIdx = (r: number, c: number) => r * (cols + 1) + c;
  const sides = (hh: (string | null)[], vv: (string | null)[], r: number, c: number) =>
    (hh[hIdx(r, c)] ? 1 : 0) + (hh[hIdx(r + 1, c)] ? 1 : 0) + (vv[vIdx(r, c)] ? 1 : 0) + (vv[vIdx(r, c + 1)] ? 1 : 0);
  const legal: number[] = [];
  for (let i = 0; i < h.length; i++) if (!h[i]) legal.push(i);
  for (let i = 0; i < v.length; i++) if (!v[i]) legal.push(numH + i);
  if (!legal.length) return null;
  const sim = (id: number): [(string | null)[], (string | null)[]] => {
    const hh = h.slice();
    const vv = v.slice();
    if (id < numH) hh[id] = "x";
    else vv[id - numH] = "x";
    return [hh, vv];
  };
  const countAt = (hh: (string | null)[], vv: (string | null)[], n: number) => {
    let k = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (sides(hh, vv, r, c) === n) k++;
    return k;
  };
  const four0 = countAt(h, v, 4);
  for (const e of legal) {
    const [hh, vv] = sim(e);
    if (countAt(hh, vv, 4) > four0) return e; // completes a box
  }
  const three0 = countAt(h, v, 3);
  const safe = legal.filter((e) => {
    const [hh, vv] = sim(e);
    return countAt(hh, vv, 3) <= three0; // gives no 3rd side away
  });
  if (safe.length) return safe[Math.floor(safe.length / 2)];
  return legal.reduce((best, e) => {
    const [hh, vv] = sim(e);
    const [bh, bv] = sim(best);
    return countAt(hh, vv, 3) < countAt(bh, bv, 3) ? e : best;
  }, legal[0]);
}

export function DotsAndBoxes({ board, meId, players = [], onAction }: Props) {
  if (!board) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center font-[var(--font-display)] text-2xl text-[var(--color-text-secondary)]">
        setting the board...
      </div>
    );
  }

  const { cols, rows } = board;
  const numH = board.num_h ?? (rows + 1) * cols;
  const h = board.h ?? [];
  const v = board.v ?? [];
  const boxOwner = board.boxes ?? [];

  const me = meId && board.order.includes(meId) ? meId : board.order[0];
  const opp = board.order.find((id) => id !== me) ?? board.order[1];
  const oppName = opp === "ai" ? "Caver" : players.find((p) => p.id === opp)?.display_name ?? "opponent";
  const isSolo = opp === "ai";
  const myTurn = board.turn === me;
  const over = boxOwner.every((o) => o !== null);
  const myScore = board.scores[me] ?? 0;
  const oppScore = board.scores[opp] ?? 0;
  const outcome = over ? (myScore > oppScore ? "you win" : oppScore > myScore ? `${oppName} wins` : "a draw") : null;

  const color = (o: string | null) => (o === me ? YOU : o === opp ? OPP : null);
  const dx = (c: number) => P + c * S;
  const dy = (r: number) => P + r * S;

  const play = (edgeId: number) => {
    if (!myTurn || over) return;
    onAction({ edge: edgeId });
  };

  const [assist, setAssist] = useAssist();
  const canAssist = assist && isSolo; // hints only vs the Caver, never against a human
  const drawn = h.filter(Boolean).length + v.filter(Boolean).length;
  const hintEdge = useMemo(
    () => (canAssist && myTurn && !over ? dotsHint(h, v, cols, rows, numH) : null),
    [canAssist, myTurn, over, h, v, cols, rows, numH]
  );
  const showHint = useIdleHint(canAssist && myTurn && !over && hintEdge != null, drawn);
  // Coords of the suggested edge, for the pulse overlay.
  let hintLine: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (showHint && hintEdge != null) {
    if (hintEdge < numH) {
      const r = Math.floor(hintEdge / cols);
      const c = hintEdge % cols;
      hintLine = { x1: dx(c), y1: dy(r), x2: dx(c + 1), y2: dy(r) };
    } else {
      const idx = hintEdge - numH;
      const r = Math.floor(idx / (cols + 1));
      const c = idx % (cols + 1);
      hintLine = { x1: dx(c), y1: dy(r), x2: dx(c), y2: dy(r + 1) };
    }
  }

  const W = cols * S + 2 * P;
  const H = rows * S + 2 * P;

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-center px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
      <header className="flex w-full items-center justify-between py-4">
        <Chip color={YOU} label="you" score={myScore} active={myTurn && !over} />
        <div className="text-center font-[var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
          {outcome ?? (myTurn ? "your move" : `${oppName} is thinking`)}
        </div>
        <Chip color={OPP} label={oppName} score={oppScore} active={!myTurn && !over} align="right" />
      </header>

      <div className="flex w-full flex-1 flex-col items-center justify-center">
      <div className="w-full max-w-[372px] rounded-[16px] border p-3.5" style={{ borderColor: "var(--color-border)", background: "#0f1017" }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ touchAction: "manipulation" }}>
          {/* claimed boxes */}
          {boxOwner.map((o, i) => {
            if (!o) return null;
            const r = Math.floor(i / cols);
            const c = i % cols;
            const col = color(o);
            return <rect key={`b${i}`} x={dx(c)} y={dy(r)} width={S} height={S} rx={1.4} fill={col ?? "#333"} fillOpacity={0.24} />;
          })}

          {/* horizontal edges */}
          {h.map((o, idx) => {
            const r = Math.floor(idx / cols);
            const c = idx % cols;
            const x1 = dx(c);
            const x2 = dx(c + 1);
            const y = dy(r);
            const col = color(o);
            return (
              <g key={`h${idx}`}>
                {o ? (
                  <line x1={x1} y1={y} x2={x2} y2={y} stroke={col!} strokeWidth={1.9} strokeLinecap="round" />
                ) : (
                  <line x1={x1} y1={y} x2={x2} y2={y} stroke="var(--color-border)" strokeWidth={0.8} strokeLinecap="round" opacity={myTurn && !over ? 0.9 : 0.4} />
                )}
                {!o && (
                  <line x1={x1} y1={y} x2={x2} y2={y} stroke="transparent" strokeWidth={5} strokeLinecap="round" style={{ cursor: myTurn && !over ? "pointer" : "default" }} onClick={() => play(idx)} />
                )}
              </g>
            );
          })}

          {/* vertical edges */}
          {v.map((o, idx) => {
            const r = Math.floor(idx / (cols + 1));
            const c = idx % (cols + 1);
            const x = dx(c);
            const y1 = dy(r);
            const y2 = dy(r + 1);
            const col = color(o);
            const edgeId = numH + idx;
            return (
              <g key={`v${idx}`}>
                {o ? (
                  <line x1={x} y1={y1} x2={x} y2={y2} stroke={col!} strokeWidth={1.9} strokeLinecap="round" />
                ) : (
                  <line x1={x} y1={y1} x2={x} y2={y2} stroke="var(--color-border)" strokeWidth={0.8} strokeLinecap="round" opacity={myTurn && !over ? 0.9 : 0.4} />
                )}
                {!o && (
                  <line x1={x} y1={y1} x2={x} y2={y2} stroke="transparent" strokeWidth={5} strokeLinecap="round" style={{ cursor: myTurn && !over ? "pointer" : "default" }} onClick={() => play(edgeId)} />
                )}
              </g>
            );
          })}

          {/* dots */}
          {Array.from({ length: rows + 1 }).map((_, r) =>
            Array.from({ length: cols + 1 }).map((_, c) => (
              <circle key={`d${r}-${c}`} cx={dx(c)} cy={dy(r)} r={1.3} fill="#5a6178" />
            ))
          )}

          {/* assist: gently blink the suggested line */}
          {hintLine && (
            <line className="animate-pulse" x1={hintLine.x1} y1={hintLine.y1} x2={hintLine.x2} y2={hintLine.y2} stroke={YOU} strokeWidth={2.2} strokeLinecap="round" />
          )}
        </svg>
      </div>

      {isSolo && (
        <div className="mt-5 flex justify-center">
          <AssistToggle on={assist} onChange={setAssist} />
        </div>
      )}
      <p className="mt-3 text-center text-xs text-[var(--color-text-secondary)]">
        tap a line between two dots · close the 4th side of a box to claim it and go again
      </p>
      </div>
    </main>
  );
}

function Chip({ color, label, score, active, align = "left" }: { color: string; label: string; score: number; active: boolean; align?: "left" | "right" }) {
  return (
    <div className={`flex items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <span className="h-8 w-8 rounded-[8px]" style={{ background: color, outline: active ? "2px solid var(--color-text-primary)" : "none", outlineOffset: 2 }} />
      <div className={align === "right" ? "items-end" : ""}>
        <div className="font-[var(--font-display)] text-xl font-bold leading-none tabular-nums">{score}</div>
        <div className="max-w-[90px] truncate font-[var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">{label}</div>
      </div>
    </div>
  );
}
