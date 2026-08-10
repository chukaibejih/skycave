"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { BoardState, PlayerSlot } from "@/lib/types";

interface Props {
  board: BoardState | null;
  meId?: string;
  players?: PlayerSlot[];
  onAction: (data: Record<string, unknown>) => void;
  spectator?: boolean; // read-only watcher: no "your move", no tapping
}

// Two clear colours that read on the white board, echoing the physical caps.
const C = ["#2563eb", "#f97316"]; // order[0] = blue, order[1] = orange
const EDGE = "#334155";
const EMPTY_FILL = "#ffffff";
const EMPTY_STROKE = "#94a3b8";

type Piece = { key: string; pid: string; node: number };

export function Crossing({ board, meId, players = [], onAction, spectator = false }: Props) {
  const [selected, setSelected] = useState<number | null>(null);

  // Track pieces across moves so the one that moved SLIDES rather than popping.
  // Exactly one piece changes node per turn; match unchanged nodes first, then
  // carry the leftover previous piece to the newly occupied node.
  const piecesRef = useRef<Piece[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const seq = useRef(0);
  useEffect(() => {
    if (!board?.occ) return;
    const curByPid: Record<string, number[]> = {};
    for (const [n, pid] of Object.entries(board.occ)) (curByPid[pid] ||= []).push(Number(n));
    const prev = piecesRef.current;
    const next: Piece[] = [];
    const used = new Set<string>();
    for (const pid of Object.keys(curByPid)) {
      const remaining = [...curByPid[pid]];
      const mine = prev.filter((p) => p.pid === pid);
      for (const pp of mine) {
        const i = remaining.indexOf(pp.node);
        if (i >= 0) {
          next.push({ ...pp });
          used.add(pp.key);
          remaining.splice(i, 1);
        }
      }
      const leftover = mine.filter((pp) => !used.has(pp.key));
      for (const node of remaining) {
        const pp = leftover.shift();
        next.push(pp ? { key: pp.key, pid, node } : { key: `p${seq.current++}`, pid, node });
      }
    }
    piecesRef.current = next;
    setPieces(next);
  }, [board?.occ]);

  // Clear a stale selection whenever the position or turn changes.
  useEffect(() => setSelected(null), [board?.moves, board?.turn]);

  if (!board || !board.nodes) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center font-[var(--font-display)] text-2xl text-[var(--color-text-secondary)]">
        setting the board...
      </div>
    );
  }

  const order = board.order;
  const me = meId && order.includes(meId) ? meId : order[0];
  const opp = order.find((id) => id !== me) ?? order[1];
  const idxOf = (pid: string) => (order[0] === pid ? 0 : 1);
  const nameOf = (id: string) =>
    id === "ai" ? "Caver" : players.find((p) => p.id === id)?.display_name ?? "opponent";
  const oppName = nameOf(opp);
  const over = board.winner != null || !!board.draw;
  const myTurn = !spectator && board.turn === me && !over;

  const nodesEntries = Object.entries(board.nodes) as [string, [number, number]][];
  const pos = (n: number) => board.nodes![String(n)];
  const dests =
    selected != null && myTurn
      ? (board.legal ?? []).filter((m) => m[0] === selected).map((m) => m[1])
      : [];
  const destSet = new Set(dests);

  const tap = (n: number) => {
    if (!myTurn) return;
    if (board.occ?.[String(n)] === me) {
      setSelected((s) => (s === n ? null : n));
    } else if (selected != null && destSet.has(n)) {
      onAction({ from: selected, to: n });
      setSelected(null);
    } else {
      setSelected(null);
    }
  };

  // Tight view box around the node cloud, with a margin.
  const xs = nodesEntries.map(([, p]) => p[0]);
  const ys = nodesEntries.map(([, p]) => p[1]);
  const M = 9;
  const vb = `${Math.min(...xs) - M} ${Math.min(...ys) - M} ${Math.max(...xs) - Math.min(...xs) + 2 * M} ${Math.max(...ys) - Math.min(...ys) + 2 * M}`;

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-center px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
      <header className="flex w-full items-center justify-between py-4">
        <Chip color={C[idxOf(me)]} label={spectator ? nameOf(me) : "you"} active={!over && board.turn === me} />
        <div className="text-center font-[var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
          {over
            ? board.winner == null
              ? "a draw"
              : spectator
                ? `${nameOf(board.winner)} wins`
                : board.winner === me
                  ? "you win"
                  : `${oppName} wins`
            : spectator
              ? `${nameOf(board.turn)} to move`
              : myTurn
                ? "your move"
                : `${oppName} is thinking`}
        </div>
        <Chip color={C[idxOf(opp)]} label={oppName} active={!over && board.turn === opp} align="right" />
      </header>

      <div className="flex w-full flex-1 flex-col items-center justify-center">
        {/* The white "paper" board — deliberately unlike the dark app surface. */}
        <div className="w-full max-w-[420px] rounded-[20px] bg-white p-3 shadow-[0_18px_44px_rgba(0,0,0,0.45)]">
          <svg viewBox={vb} style={{ width: "100%", height: "auto", display: "block" }}>
            {/* target rings: faint markers of where each side is heading */}
            {order.map((pid) =>
              (board.targets?.[pid] ?? []).map((n) => {
                const p = pos(n);
                return (
                  <circle key={`t${pid}${n}`} cx={p[0]} cy={p[1]} r={5.6} fill="none"
                    stroke={C[idxOf(pid)]} strokeOpacity={0.28} strokeWidth={0.7} strokeDasharray="1.6 1.6" />
                );
              })
            )}
            {/* edges */}
            {(board.edges ?? []).map(([a, b], i) => {
              const pa = pos(a);
              const pb = pos(b);
              const hot = selected != null && ((a === selected && destSet.has(b)) || (b === selected && destSet.has(a)));
              return (
                <line key={`e${i}`} x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]}
                  stroke={hot ? C[idxOf(me)] : EDGE} strokeOpacity={hot ? 0.7 : 0.55}
                  strokeWidth={hot ? 1.8 : 1.2} strokeLinecap="round" />
              );
            })}
            {/* empty nodes + legal-destination highlights */}
            {nodesEntries.map(([id, p]) => {
              const n = Number(id);
              if (board.occ?.[id]) return null; // occupied nodes drawn as pieces below
              const legal = destSet.has(n);
              return (
                <g key={`n${id}`}>
                  <circle cx={p[0]} cy={p[1]} r={2.8} fill={EMPTY_FILL} stroke={EMPTY_STROKE} strokeWidth={0.8} />
                  {legal && (
                    <motion.circle cx={p[0]} cy={p[1]} r={4.6} fill={C[idxOf(me)]} fillOpacity={0.18}
                      stroke={C[idxOf(me)]} strokeWidth={1} initial={{ opacity: 0.5 }}
                      animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.2, repeat: Infinity }} />
                  )}
                </g>
              );
            })}
            {/* pieces — slide from their old node to the new one */}
            {pieces.map((pc) => {
              const p = pos(pc.node);
              const isMine = pc.pid === me;
              const isSel = selected === pc.node && isMine;
              const dim = over && board.winner != null && pc.pid !== board.winner;
              return (
                <motion.g key={pc.key} initial={false} animate={{ x: p[0], y: p[1] }}
                  transition={{ type: "spring", stiffness: 320, damping: 30 }}
                  style={{ cursor: isMine && myTurn ? "pointer" : "default" }}>
                  {isSel && <circle r={6.2} fill="none" stroke={C[idxOf(pc.pid)]} strokeWidth={1.4} />}
                  <circle r={4.3} fill={C[idxOf(pc.pid)]} fillOpacity={dim ? 0.4 : 1}
                    stroke="#ffffff" strokeWidth={1} />
                </motion.g>
              );
            })}
            {/* generous tap targets on every node, on top */}
            {nodesEntries.map(([id, p]) => (
              <circle key={`h${id}`} cx={p[0]} cy={p[1]} r={7} fill="transparent"
                onClick={() => tap(Number(id))} style={{ cursor: myTurn ? "pointer" : "default" }} />
            ))}
          </svg>
        </div>

        <p className="mt-4 text-center text-xs text-[var(--color-text-secondary)]">
          {spectator
            ? "watching live · first to fill the far side wins"
            : selected != null
              ? "tap a highlighted node to move there"
              : myTurn
                ? "tap one of your pieces, then a connected open node"
                : "get all three pieces to the far side · no jumping"}
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
