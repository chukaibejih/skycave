"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
type Ripple = { id: string; n: number; color: string };

export function Crossing({ board, meId, players = [], onAction, spectator = false }: Props) {
  const [selected, setSelected] = useState<number | null>(null);

  // First-timer explainer: shown once (remembered), reopenable via the "?" button.
  const [showIntro, setShowIntro] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("skycave_crossing_intro")) {
      setShowIntro(true);
    }
  }, []);
  const dismissIntro = () => {
    setShowIntro(false);
    try {
      localStorage.setItem("skycave_crossing_intro", "1");
    } catch {
      /* private mode; fine */
    }
  };

  // Track pieces across moves so the one that moved SLIDES rather than popping.
  const piecesRef = useRef<Piece[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    if (!board?.occ) return;
    const curByPid: Record<string, number[]> = {};
    for (const [n, pid] of Object.entries(board.occ)) (curByPid[pid] ||= []).push(Number(n));
    const prev = piecesRef.current;
    const next: Piece[] = [];
    const used = new Set<string>();
    const movedToNodes: { n: number; pid: string }[] = [];

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
        if (pp) movedToNodes.push({ n: node, pid });
        next.push(pp ? { key: pp.key, pid, node } : { key: `p${seq.current++}`, pid, node });
      }
    }
    piecesRef.current = next;
    setPieces(next);

    // Trigger impact ripples for newly occupied nodes (skip on initial render)
    if (movedToNodes.length > 0 && prev.length > 0) {
      const newRips = movedToNodes.map(m => ({
        id: `r-${Date.now()}-${m.n}`,
        n: m.n,
        color: C[board.order[0] === m.pid ? 0 : 1]
      }));
      setRipples(r => [...r, ...newRips]);
      setTimeout(() => {
        setRipples(r => r.filter(rip => !newRips.find(nr => nr.id === rip.id)));
      }, 1000);
    }
  }, [board?.occ, board?.order]);

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

  // Render from the local player's perspective: rotate the board to vertical and
  // put "me" at the bottom, advancing UP to my target row at the top. Each client
  // does this for its own side, so both players sit at the bottom of their own
  // screen (like facing each other across a real board). It also turns the wide
  // layout portrait, filling the tall phone with more board room.
  const meIsA = me === order[0];
  const rxs = nodesEntries.map(([, p]) => p[0]);
  const rys = nodesEntries.map(([, p]) => p[1]);
  const xmin = Math.min(...rxs);
  const xspan = Math.max(...rxs) - xmin || 1;
  const ymin = Math.min(...rys);
  const yspan = Math.max(...rys) - ymin || 1;
  // Stretch the advance (vertical) axis so the portrait board fills the tall card
  // instead of floating in the top with dead space below. Marks keep a fixed
  // radius, so only the spacing grows - the pieces stay round.
  const ADV = 1.7;
  const project = (raw: [number, number]): [number, number] => {
    const t = (raw[0] - xmin) / xspan; // 0 = A side, 1 = B side
    const h = (raw[1] - ymin) / yspan; // across
    const v = meIsA ? 1 - t : t; // my start -> bottom, my target -> top
    const hh = meIsA ? h : 1 - h;
    return [hh * yspan, v * xspan * ADV]; // width = perpendicular, height = advance
  };
  const pos = (n: number) => project(board.nodes![String(n)]);
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

  // Tight view box around the PROJECTED node cloud, with a margin.
  const proj = nodesEntries.map(([, p]) => project(p));
  const pxs = proj.map((p) => p[0]);
  const pys = proj.map((p) => p[1]);
  const M = 16;
  const vb = `${Math.min(...pxs) - M} ${Math.min(...pys) - M} ${Math.max(...pxs) - Math.min(...pxs) + 2 * M} ${Math.max(...pys) - Math.min(...pys) + 2 * M}`;

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
        {/* The white "paper" board — deliberately unlike the dark app surface.
            flex-1 lets it grow into the free vertical space; the svg fits inside
            (preserveAspectRatio) so a bigger card just means a bigger board. */}
        <div className="flex w-full min-h-0 max-w-[520px] flex-1 flex-col rounded-[24px] bg-white p-4 shadow-[0_18px_44px_rgba(0,0,0,0.45)]">
          <svg viewBox={vb} preserveAspectRatio="xMidYMid meet" className="min-h-0 w-full flex-1" style={{ display: "block" }}>
            
            {/* Shaded Target Zones: solidifying the home vs away feeling */}
            {order.map((pid) => {
              const tNodes = board.targets?.[pid] ?? [];
              if (tNodes.length === 0) return null;
              return (
                <g key={`tz${pid}`}>
                  {tNodes.map(n => {
                    const p = pos(n);
                    return <circle key={`tc${n}`} cx={p[0]} cy={p[1]} r={11} fill={C[idxOf(pid)]} opacity={0.06} />;
                  })}
                </g>
              );
            })}

            {/* target rings: faint markers of where each side is heading */}
            {order.map((pid) =>
              (board.targets?.[pid] ?? []).map((n) => {
                const p = pos(n);
                return (
                  <circle key={`t${pid}${n}`} cx={p[0]} cy={p[1]} r={4.6} fill="none"
                    stroke={C[idxOf(pid)]} strokeOpacity={0.28} strokeWidth={0.6} strokeDasharray="1.4 1.4" />
                );
              })
            )}

            {/* edges with glowing path trails */}
            {(board.edges ?? []).map(([a, b], i) => {
              const pa = pos(a);
              const pb = pos(b);
              const hot = selected != null && ((a === selected && destSet.has(b)) || (b === selected && destSet.has(a)));
              return (
                <g key={`e${i}`}>
                  <line x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]}
                    stroke={hot ? C[idxOf(me)] : EDGE} strokeOpacity={hot ? 0.3 : 0.55}
                    strokeWidth={hot ? 1.6 : 0.9} strokeLinecap="round" />
                  {hot && (
                    <motion.line x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]}
                      stroke={C[idxOf(me)]} strokeOpacity={0.9} strokeWidth={1.4} strokeLinecap="round" strokeDasharray="4 4"
                      animate={{ strokeDashoffset: [16, 0] }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} />
                  )}
                </g>
              );
            })}

            {/* empty nodes + legal-destination highlights */}
            {nodesEntries.map(([id]) => {
              const n = Number(id);
              if (board.occ?.[id]) return null; // occupied nodes drawn as pieces below
              const pp = pos(n);
              const legal = destSet.has(n);
              return (
                <g key={`n${id}`}>
                  <circle cx={pp[0]} cy={pp[1]} r={2.2} fill={EMPTY_FILL} stroke={EMPTY_STROKE} strokeWidth={0.7} />
                  {legal && (
                    <motion.circle cx={pp[0]} cy={pp[1]} r={3.8} fill={C[idxOf(me)]} fillOpacity={0.18}
                      stroke={C[idxOf(me)]} strokeWidth={0.9} initial={{ opacity: 0.5 }}
                      animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.2, repeat: Infinity }} />
                  )}
                </g>
              );
            })}

            {/* Impact ripples */}
            <AnimatePresence>
              {ripples.map(r => {
                const p = pos(r.n);
                return (
                  <motion.circle key={r.id} cx={p[0]} cy={p[1]} fill={r.color}
                    initial={{ r: 3, opacity: 0.8 }}
                    animate={{ r: 14, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    style={{ pointerEvents: "none" }}
                  />
                );
              })}
            </AnimatePresence>

            {/* pieces — slide from their old node to the new one with pick up effect */}
            {pieces.map((pc) => {
              const p = pos(pc.node);
              const isMine = pc.pid === me;
              const isSel = selected === pc.node && isMine;
              const isWinner = over && board.winner != null && pc.pid === board.winner;
              const dim = over && board.winner != null && pc.pid !== board.winner;
              const col = C[idxOf(pc.pid)];
              return (
                <motion.g key={pc.key} initial={false}
                  animate={{ x: p[0], y: p[1], scale: isWinner ? [1, 1.28, 1] : isSel ? 1.25 : 1 }}
                  transition={{
                    x: { type: "spring", stiffness: 320, damping: 30 },
                    y: { type: "spring", stiffness: 320, damping: 30 },
                    scale: isWinner
                      ? { duration: 0.7, repeat: Infinity, ease: "easeInOut" }
                      : { type: "spring", stiffness: 320, damping: 30 },
                  }}
                  style={{
                    cursor: isMine && myTurn ? "pointer" : "default",
                    filter: isWinner
                      ? `drop-shadow(0 0 4px ${col})`
                      : isSel ? "drop-shadow(0 3px 4px rgba(0,0,0,0.3))" : "none",
                  }}>
                  {isWinner && (
                    <motion.circle r={5.4} fill="none" stroke={col} strokeWidth={1}
                      animate={{ opacity: [0.7, 0.12, 0.7] }} transition={{ duration: 0.7, repeat: Infinity }} />
                  )}
                  {isSel && <circle r={5.2} fill="none" stroke={col} strokeWidth={1.2} />}
                  <circle r={3.5} fill={col} fillOpacity={dim ? 0.4 : 1} stroke="#ffffff" strokeWidth={0.9} />
                </motion.g>
              );
            })}

            {/* generous tap targets on every node, on top (projected positions) */}
            {nodesEntries.map(([id]) => {
              const pp = pos(Number(id));
              return (
                <circle key={`h${id}`} cx={pp[0]} cy={pp[1]} r={7} fill="transparent"
                  onClick={() => tap(Number(id))} style={{ cursor: myTurn ? "pointer" : "default" }} />
              );
            })}
          </svg>
        </div>

        <div className="mt-4 flex w-full items-center justify-center gap-2">
          <p className="text-center text-xs text-[var(--color-text-secondary)]">
            {spectator
              ? "watching live · first to fill the far side wins"
              : selected != null
                ? "tap a highlighted node to move there"
                : myTurn
                  ? "tap one of your pieces, then a connected open node"
                  : "get all three pieces to the far side · no jumping"}
          </p>
          <button
            onClick={() => setShowIntro(true)}
            aria-label="how to play"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] text-[11px] font-bold leading-none text-[var(--color-text-secondary)]"
          >
            ?
          </button>
        </div>
      </div>

      {/* First-timer explainer, reopenable via the "?" button */}
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
                  <span className="text-[var(--color-text-primary)]">You and your opponent each have three pieces, starting on opposite sides of the board.</span>
                </li>
                <li>On your turn, tap one of your pieces, then a connected open dot to move it there. One step at a time, no jumping over pieces.</li>
                <li>Get all three of your pieces to the far side (your opponent&apos;s starting dots) to win the race.</li>
                <li>Your opponent is coming the other way, so you will block each other. Getting in the way is part of it.</li>
                <li>If nobody completes the crossing, whoever advanced further wins. Dead even is a draw.</li>
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
