"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRoom } from "@/lib/store";
import type { PlayerSlot, UnoBoard, UnoCard } from "@/lib/types";

interface Props {
  board: unknown; // the shared table (UnoBoard); typed loosely by GameShell
  meId?: string;
  players: PlayerSlot[];
  onAction: (data: Record<string, unknown>) => void;
}

const SUIT: Record<string, string> = {
  r: "#ff5a4e",
  y: "#ffd166",
  g: "#3fce7c",
  b: "#4a90ff",
};

// Short faces. Numbers speak for themselves; actions need a glyph that reads at
// card size, since a word would wrap.
const FACE: Record<string, string> = {
  skip: "⊘",
  rev: "⇄",
  d2: "+2",
  wild: "★",
  wd4: "+4",
};

const face = (c: UnoCard) => FACE[c.value] ?? c.value;

function Card({
  card,
  size = "hand",
  dim,
  raised,
  onClick,
}: {
  card: UnoCard;
  size?: "hand" | "table";
  dim?: boolean;
  raised?: boolean;
  onClick?: () => void;
}) {
  const table = size === "table";
  const w = table ? 78 : 58;
  const h = table ? 112 : 84;
  const wild = card.color === "w";
  return (
    <motion.button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      animate={{ y: raised ? -14 : 0 }}
      whileTap={onClick ? { scale: 0.95 } : undefined}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className="relative shrink-0 rounded-[10px] border-2 font-[var(--font-display)] font-bold"
      style={{
        width: w,
        height: h,
        // A wild carries all four colours so it reads as "any colour" at a glance.
        background: wild
          ? "conic-gradient(#ff5a4e 0deg 90deg, #ffd166 90deg 180deg, #3fce7c 180deg 270deg, #4a90ff 270deg 360deg)"
          : SUIT[card.color],
        borderColor: raised ? "#f5f7ff" : "rgba(5,6,10,0.35)",
        color: "#05060a",
        opacity: dim ? 0.62 : 1,
        cursor: onClick ? "pointer" : "default",
        boxShadow: raised ? "0 6px 18px rgba(139,124,255,0.45)" : "0 2px 6px rgba(0,0,0,0.4)",
      }}
    >
      {wild && (
        <span
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ width: table ? 52 : 38, height: table ? 52 : 38, background: "rgba(5,6,10,0.72)" }}
        />
      )}
      <span
        className="absolute inset-0 grid place-items-center"
        style={{ fontSize: table ? 34 : 26, color: wild ? "#f5f7ff" : "#05060a" }}
      >
        {face(card)}
      </span>
    </motion.button>
  );
}

/** Face-down card, for the opponent's hand and the draw pile. */
function CardBack({ w = 34, h = 50 }: { w?: number; h?: number }) {
  return (
    <div
      className="shrink-0 rounded-[8px] border-2"
      style={{
        width: w,
        height: h,
        background: "linear-gradient(140deg, #1b2030, #0b0e16)",
        borderColor: "rgba(139,124,255,0.35)",
      }}
    />
  );
}

export function Uno({ board, meId, players, onAction }: Props) {
  const b = board as UnoBoard | null;
  const hand = useRoom((s) => s.privateBoard);
  // Which wild is waiting on a colour choice. Uno's only branching decision, so
  // it gets an explicit step rather than a guess.
  const [pendingWild, setPendingWild] = useState<number | null>(null);

  if (!b) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-[var(--color-text-secondary)]">
        dealing...
      </div>
    );
  }

  const opp = players.find((p) => p.id !== meId) ?? null;
  const oppId = b.order.find((id) => id !== meId) ?? "ai";
  const myTurn = b.turn === meId && !b.winner;
  const playable = new Set(hand?.playable ?? []);
  const oppCount = b.counts[oppId] ?? 0;

  const play = (card: UnoCard) => {
    if (!myTurn) return;
    if (card.color === "w") {
      setPendingWild(card.id);
      return;
    }
    onAction({ action: "play", card_id: card.id });
  };

  const chooseColor = (color: string) => {
    if (pendingWild == null) return;
    onAction({ action: "play", card_id: pendingWild, color });
    setPendingWild(null);
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
      {/* Opponent: how many cards they hold is the whole story. */}
      <div className="flex items-center gap-3 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">
            {opp?.display_name ?? "The Caver"}
          </div>
          <div className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
            {oppCount} {oppCount === 1 ? "card" : "cards"}
            {oppCount === 1 && <span style={{ color: "var(--color-warm)" }}> · uno!</span>}
          </div>
        </div>
        <div className="flex -space-x-4">
          {Array.from({ length: Math.min(oppCount, 8) }).map((_, i) => (
            <CardBack key={i} />
          ))}
        </div>
      </div>

      {/* The table: draw pile on the left, the card in play on the right. */}
      <div className="flex flex-1 items-center justify-center gap-7">
        <button
          type="button"
          disabled={!myTurn || b.must_play_or_pass}
          onClick={() => onAction({ action: "draw" })}
          className="flex flex-col items-center gap-1.5 disabled:opacity-45"
        >
          <CardBack w={78} h={112} />
          <span className="font-[var(--font-mono)] text-[11px] uppercase tracking-wide text-[var(--color-text-secondary)]">
            draw · {b.deck_left}
          </span>
        </button>

        <div className="flex flex-col items-center gap-1.5">
          <Card card={b.top} size="table" />
          {/* A wild leaves the top card the wrong colour, so the colour in play
              is stated separately rather than inferred from the card. */}
          <span
            className="rounded-full px-2.5 py-0.5 font-[var(--font-mono)] text-[11px] uppercase tracking-wide"
            style={{ background: SUIT[b.color], color: "#05060a" }}
          >
            {b.color === "r" ? "red" : b.color === "y" ? "yellow" : b.color === "g" ? "green" : "blue"}
          </span>
        </div>
      </div>

      {/* Whose turn, and what just happened. */}
      <div className="py-3 text-center">
        <div
          className="font-[var(--font-display)] text-lg font-bold"
          style={{ color: myTurn ? "var(--color-primary)" : "var(--color-text-secondary)" }}
        >
          {b.winner
            ? b.winner === meId
              ? "You went out!"
              : `${opp?.display_name ?? "The Caver"} went out.`
            : myTurn
              ? b.must_play_or_pass
                ? "Play it or keep it"
                : "Your turn"
              : `${opp?.display_name ?? "The Caver"}'s turn`}
        </div>
        {b.last && !b.winner && (
          <div className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
            {describe(b.last, b.last.by === meId)}
          </div>
        )}
      </div>

      {/* Your hand. Playable cards lift and brighten; the rest stay put. */}
      <div className="flex min-h-[104px] items-end gap-1.5 overflow-x-auto pb-1">
        {(hand?.hand ?? []).map((c) => {
          const can = myTurn && playable.has(c.id);
          return (
            <Card
              key={c.id}
              card={c}
              raised={can}
              dim={myTurn && !can}
              onClick={can ? () => play(c) : undefined}
            />
          );
        })}
      </div>

      {/* Drew a card you can play: take it or leave it. */}
      {myTurn && b.must_play_or_pass && (
        <button
          type="button"
          onClick={() => onAction({ action: "pass" })}
          className="mt-2 h-11 rounded-[12px] border text-sm font-semibold"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
        >
          Keep it and pass
        </button>
      )}

      {/* Wilds: the one moment Uno asks a question. */}
      <AnimatePresence>
        {pendingWild != null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-[rgba(5,6,10,0.72)] p-6 backdrop-blur-sm"
            onClick={() => setPendingWild(null)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xs rounded-[16px] border p-5"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
            >
              <div className="mb-3 text-center font-[var(--font-display)] text-lg font-bold">
                Pick a colour
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {(["r", "y", "g", "b"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => chooseColor(c)}
                    className="h-16 rounded-[12px] font-[var(--font-display)] font-bold"
                    style={{ background: SUIT[c], color: "#05060a" }}
                  >
                    {c === "r" ? "Red" : c === "y" ? "Yellow" : c === "g" ? "Green" : "Blue"}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** One line of plain English for the previous move. */
function describe(last: NonNullable<UnoBoard["last"]>, mine: boolean): string {
  const who = mine ? "You" : "They";
  switch (last.kind) {
    case "draw2":
      return `${who} played +2`;
    case "wild4":
      return `${who} played +4`;
    case "wild":
      return `${who} changed the colour`;
    case "skip":
      return `${who} played a skip`;
    case "drew":
      return `${who} drew a card`;
    case "drew_playable":
      return `${who} drew a card`;
    case "passed":
      return `${who} passed`;
    case "opening_skip":
      return "Opening card skipped the first turn";
    case "opening_draw2":
      return "Opening card dealt two";
    case "deck_empty":
      return "The deck ran out";
    default:
      return "";
  }
}
