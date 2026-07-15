"use client";
import type { BoardState, PlayerSlot } from "@/lib/types";

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

      <div className="w-full max-w-[330px] rounded-[16px] border p-3" style={{ borderColor: "var(--color-border)", background: "#0f1017" }}>
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
        </svg>
      </div>

      <p className="mt-4 text-center text-xs text-[var(--color-text-secondary)]">
        tap a line between two dots · close the 4th side of a box to claim it and go again
      </p>
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
