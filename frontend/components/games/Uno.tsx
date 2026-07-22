"use client";
import { useEffect, useRef, useState } from "react";
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

const COLOR_NAME: Record<string, string> = {
  r: "red",
  y: "yellow",
  g: "green",
  b: "blue",
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

// Cards that hand the turn straight back to you in a two-player game.
const KEEPS_TURN = ["skip", "draw2", "wild4"];

function Card({
  card,
  size = "hand",
  dim,
  raised,
  fresh,
  onClick,
}: {
  card: UnoCard;
  size?: "hand" | "table";
  dim?: boolean;
  raised?: boolean;
  fresh?: boolean; // just drawn - the player needs to find it
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
        borderColor: fresh ? "var(--color-cyan)" : raised ? "#f5f7ff" : "rgba(5,6,10,0.35)",
        color: "#05060a",
        opacity: dim ? 0.62 : 1,
        cursor: onClick ? "pointer" : "default",
        boxShadow: fresh
          ? "0 0 0 2px var(--color-cyan), 0 6px 18px rgba(103,232,249,0.45)"
          : raised
            ? "0 6px 18px rgba(139,124,255,0.45)"
            : "0 2px 6px rgba(0,0,0,0.4)",
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
      {/* Corner index. In a fanned hand only the left sliver of each card shows,
          so the centre glyph is hidden on everything but the last card - which
          is the exact reason real playing cards carry their value in the
          corner. Without it a big hand is unreadable. */}
      {!table && (
        <span
          className="absolute left-[3px] top-[2px] font-[var(--font-display)] leading-none"
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: wild ? "#f5f7ff" : "#05060a",
            textShadow: wild ? "0 1px 3px rgba(5,6,10,0.9)" : "none",
          }}
        >
          {face(card)}
        </span>
      )}
      {fresh && (
        <span
          className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full px-1.5 py-px font-[var(--font-mono)] text-[9px] uppercase tracking-wide"
          style={{ background: "var(--color-cyan)", color: "#05060a" }}
        >
          new
        </span>
      )}
    </motion.button>
  );
}

/**
 * A card in transit between two places on screen.
 *
 * The state changes instantly, so without this a played card simply appears on
 * the pile and drawn cards materialise in your hand - you never see the move
 * that produced them. Each flight is a ghost copy that travels the real path
 * and lands exactly on its destination.
 */
interface Flight {
  key: string;
  card: UnoCard | null; // null renders face-down (a draw, where the face is private)
  from: { x: number; y: number };
  to: { x: number; y: number };
  delay: number;
  scaleTo: number; // the pile shows bigger cards than a hand does
}

const HAND_W = 58;
const HAND_H = 84;
const TABLE_W = 78;

/**
 * Where each card sits in a fanned hand.
 *
 * A flat scrolling row never read as cards being *held* - and once a hand grew
 * past a screen width it hid cards off the edge, which in a game about what you
 * are holding is the wrong thing to hide. Cards now overlap by exactly as much
 * as it takes to fit, so the whole hand is always visible at once, and they
 * splay along an arc the way a real hand does.
 */
function fanLayout(n: number, width: number, cardW: number, spread: number, arc: number) {
  if (n <= 0 || width <= 0) return [];
  // Never spread further than a card's own width; past that it stops reading as
  // one hand and becomes a row of separate cards.
  const spacing = n === 1 ? 0 : Math.min(cardW * 0.78, (width - cardW) / (n - 1));
  const startX = (width - (cardW + spacing * (n - 1))) / 2;
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; // -1 (left) .. 1 (right)
    return {
      x: startX + i * spacing,
      angle: t * spread,
      lift: (1 - t * t) * arc, // highest in the middle, like a held fan
    };
  });
}

const centerOf = (el: HTMLElement | null): { x: number; y: number } | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

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
  const [pendingWild, setPendingWild] = useState<number | null>(null);
  // A short-lived announcement for things that happen TO you. Without it, two
  // cards silently appear in your hand and the colour changes under you.
  const [moment, setMoment] = useState<{ text: string; tone: string } | null>(null);
  const freshRef = useRef<HTMLDivElement | null>(null);
  // Anchors the flight paths are measured against.
  const discardRef = useRef<HTMLDivElement | null>(null);
  const drawRef = useRef<HTMLDivElement | null>(null);
  const handRef = useRef<HTMLDivElement | null>(null);
  const oppRef = useRef<HTMLDivElement | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const seqRef = useRef<number>(-1);
  const [handW, setHandW] = useState(0);
  const [oppW, setOppW] = useState(0);

  const last = b?.last ?? null;
  const lastKind = last?.kind ?? "";
  const lastBy = last?.by ?? "";
  const lastColor = last?.color ?? "";

  // Fire one set of flights per accepted move. `seq` is the trigger because two
  // consecutive draws produce an identical `last` payload.
  const seq = b?.seq ?? -1;
  const playedCard = last?.card ?? null;
  useEffect(() => {
    if (seq < 0 || !meId || !lastKind) return;
    if (seqRef.current === seq) return;
    const first = seqRef.current < 0;
    seqRef.current = seq;
    if (first) return; // don't animate the state we joined into

    const mine = lastBy === meId;
    const discard = centerOf(discardRef.current);
    const deck = centerOf(drawRef.current);
    const hand = centerOf(handRef.current);
    const opp = centerOf(oppRef.current);
    if (!discard || !deck || !hand || !opp) return;

    const out: Flight[] = [];
    const played = playedCard;
    const mySide = mine ? hand : opp;

    // A card being played travels from its owner to the pile.
    if (played) {
      out.push({
        key: `p-${seq}`,
        card: played,
        from: mySide,
        to: discard,
        delay: 0,
        scaleTo: TABLE_W / HAND_W,
      });
    }

    // Cards drawn come off the deck. Faces stay hidden: the reveal is the
    // ringed card that lands in your hand.
    const drawn =
      lastKind === "draw2" || lastKind === "opening_draw2"
        ? 2
        : lastKind === "wild4"
          ? 4
          : lastKind === "drew" || lastKind === "drew_playable"
            ? 1
            : 0;
    if (drawn) {
      // A played +2/+4 hits the other player; a plain draw goes to the mover.
      const toWho =
        lastKind === "draw2" || lastKind === "wild4"
          ? (mine ? opp : hand)
          : lastKind === "opening_draw2"
            ? hand
            : (mine ? hand : opp);
      for (let i = 0; i < drawn; i++) {
        out.push({
          key: `d-${seq}-${i}`,
          card: null,
          from: deck,
          to: toWho,
          delay: (played ? 0.22 : 0) + i * 0.09,
          scaleTo: 1,
        });
      }
    }
    if (!out.length) return;
    setFlights((f) => [...f, ...out]);
  }, [seq, lastKind, lastBy, meId, playedCard]);

  // Backstop. Flights retire themselves when they land, but a ghost that
  // somehow never completes would sit on the pile forever - which is precisely
  // what happened when the removal timer was being cancelled.
  useEffect(() => {
    if (!flights.length) return;
    const t = setTimeout(() => setFlights([]), 2000);
    return () => clearTimeout(t);
  }, [flights]);

  useEffect(() => {
    if (!lastKind || !meId) return;
    const theirs = !!lastBy && lastBy !== meId;
    let next: { text: string; tone: string } | null = null;
    if (theirs && lastKind === "draw2") next = { text: "You drew 2", tone: "var(--color-warm)" };
    else if (theirs && lastKind === "wild4") next = { text: "You drew 4", tone: "var(--color-warm)" };
    else if (theirs && lastKind === "wild")
      next = { text: `Colour is now ${COLOR_NAME[lastColor] ?? "new"}`, tone: "var(--color-cyan)" };
    else if (lastKind === "opening_draw2")
      next = { text: "Opening card dealt two", tone: "var(--color-warm)" };
    if (!next) return;
    setMoment(next);
  }, [lastKind, lastBy, lastColor, meId]);

  // Dismissal lives in its own effect keyed on the moment itself, so an
  // unrelated re-render cannot cancel it.
  useEffect(() => {
    if (!moment) return;
    const t = setTimeout(() => setMoment(null), 2200);
    return () => clearTimeout(t);
  }, [moment]);

  // The fan needs a real pixel width to work out how much to overlap.
  useEffect(() => {
    const measure = () => {
      if (handRef.current) setHandW(handRef.current.clientWidth);
      if (oppRef.current) setOppW(oppRef.current.clientWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (handRef.current) ro.observe(handRef.current);
    if (oppRef.current) ro.observe(oppRef.current);
    return () => ro.disconnect();
  }, []);

  // Bring a newly drawn card into view - it lands at the end of a hand that may
  // already be scrolled off-screen.
  const justDrewId = hand?.just_drew_id ?? null;
  useEffect(() => {
    if (justDrewId == null) return;
    freshRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [justDrewId]);

  if (!b) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-[var(--color-text-secondary)]">
        dealing...
      </div>
    );
  }

  const opp = players.find((p) => p.id !== meId) ?? null;
  const oppName = opp?.display_name ?? "The Caver";
  const oppId = b.order.find((id) => id !== meId) ?? "ai";
  const myTurn = b.turn === meId && !b.winner;
  const playable = new Set(hand?.playable ?? []);
  const oppCount = b.counts[oppId] ?? 0;
  const myCount = hand?.hand.length ?? 0;

  // The states that used to leave people stuck with no idea what to do.
  const nothingToPlay = myTurn && !b.must_play_or_pass && playable.size === 0;
  // A ghost is already flying onto the pile, so the card underneath shouldn't
  // pop in as well - the flight is the animation.
  const landing = flights.some((f) => f.card);
  const goAgain = myTurn && !!lastKind && lastBy === meId && KEEPS_TURN.includes(lastKind);

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

  // One line that always says exactly where the player stands. The "you go
  // again" case matters most: a skip or +2 returns the turn to you, and without
  // saying so the screen looks identical to your tap not registering.
  const iWon = b.winner === meId;
  const headline = b.winner
    ? iWon
      ? "You win!"
      : `${oppName} wins.`
    : goAgain
      ? lastKind === "skip"
        ? "Skipped · you go again"
        : "You go again"
      : b.must_play_or_pass
        ? "Play it, or keep it"
        : nothingToPlay
          ? "Nothing to play · draw one"
          : myTurn
            ? "Your turn"
            : `${oppName}'s turn`;

  const headlineTone = b.winner
    ? "var(--color-success)"
    : goAgain
      ? "var(--color-primary)"
      : nothingToPlay
        ? "var(--color-warm)"
        : myTurn
          ? "var(--color-primary)"
          : "var(--color-text-secondary)";

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
      {/* Opponent: their card count is the whole story, and one card left is the
          tensest moment in the game - so it gets said loudly. */}
      <div className="flex items-center gap-3 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{oppName}</div>
          <div className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
            {oppCount} {oppCount === 1 ? "card" : "cards"}
          </div>
        </div>
        {oppCount === 1 && (
          <motion.span
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 1.1, repeat: Infinity }}
            className="rounded-full px-2.5 py-1 font-[var(--font-display)] text-xs font-bold"
            style={{ background: "var(--color-warm)", color: "#05060a" }}
          >
            UNO!
          </motion.span>
        )}
        <div ref={oppRef} className="relative h-[54px] flex-1" style={{ maxWidth: 200 }}>
          {fanLayout(oppCount, oppW, 30, 7, 5).map((pos, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute bottom-0"
              style={{
                left: pos.x,
                transform: `translateY(${-pos.lift}px) rotate(${pos.angle}deg)`,
                transformOrigin: "bottom center",
                zIndex: i,
              }}
            >
              <CardBack w={30} h={44} />
            </motion.div>
          ))}
        </div>
      </div>

      {/* The table: draw pile on the left, the card in play on the right. */}
      <div className="relative flex flex-1 items-center justify-center gap-7">
        <motion.button
          type="button"
          disabled={!myTurn || b.must_play_or_pass}
          onClick={() => onAction({ action: "draw" })}
          // With nothing playable the draw pile is the only way forward, so it
          // asks for the tap instead of waiting to be found.
          animate={nothingToPlay ? { scale: [1, 1.06, 1] } : { scale: 1 }}
          transition={nothingToPlay ? { duration: 1.2, repeat: Infinity } : { duration: 0.2 }}
          className="flex flex-col items-center gap-1.5 disabled:opacity-45"
        >
          <div
            ref={drawRef}
            style={{
              borderRadius: 10,
              boxShadow: nothingToPlay
                ? "0 0 0 2px var(--color-warm), 0 0 22px rgba(255,114,94,0.5)"
                : "none",
            }}
          >
            <CardBack w={78} h={112} />
          </div>
          <span className="font-[var(--font-mono)] text-[11px] uppercase tracking-wide text-[var(--color-text-secondary)]">
            draw · {b.deck_left}
          </span>
        </motion.button>

        <div ref={discardRef} className="flex flex-col items-center gap-1.5">
          {/* Keyed on the card id so every new top card visibly lands, instead
              of the opponent's move teleporting into place. */}
          <AnimatePresence mode="popLayout">
            <motion.div
              key={b.top.id}
              initial={landing ? false : { scale: 0.7, rotate: -12, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 22 }}
            >
              <Card card={b.top} size="table" />
            </motion.div>
          </AnimatePresence>
          <span
            className="rounded-full px-2.5 py-0.5 font-[var(--font-mono)] text-[11px] uppercase tracking-wide"
            style={{ background: SUIT[b.color], color: "#05060a" }}
          >
            {COLOR_NAME[b.color]}
          </span>
        </div>

        {/* Things that happened to you, said out loud and briefly. */}
        <AnimatePresence>
          {moment && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: -6, scale: 1 }}
              exit={{ opacity: 0, y: -18 }}
              className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full px-3.5 py-1.5 font-[var(--font-display)] text-sm font-bold"
              style={{ background: moment.tone, color: "#05060a" }}
            >
              {moment.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Whose turn, and what to do about it. */}
      <div className="py-3 text-center">
        <motion.div
          key={headline}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-[var(--font-display)] text-lg font-bold"
          style={{ color: headlineTone }}
        >
          {headline}
        </motion.div>
        {myCount === 1 && !b.winner && (
          <div
            className="mt-0.5 font-[var(--font-display)] text-sm font-bold"
            style={{ color: "var(--color-warm)" }}
          >
            One card left.
          </div>
        )}
      </div>

      {/* Your hand. Playable cards lift and brighten; a freshly drawn one is
          ringed and scrolled into view so you can see what just changed. */}
      <div ref={handRef} className="relative h-[124px] w-full">
        {(() => {
          const cards = hand?.hand ?? [];
          const fan = fanLayout(cards.length, handW, HAND_W, 9, 12);
          return cards.map((c, i) => {
            const can = myTurn && playable.has(c.id);
            const fresh = c.id === justDrewId;
            const pos = fan[i];
            if (!pos) return null;
            return (
              <div
                key={c.id}
                ref={fresh ? freshRef : undefined}
                className="absolute bottom-0"
                style={{
                  left: pos.x,
                  // A playable card straightens and stands proud of the fan, so
                  // what you can actually play reads instantly.
                  transform: `translateY(${-pos.lift - (can ? 16 : 0)}px) rotate(${
                    can ? pos.angle * 0.3 : pos.angle
                  }deg)`,
                  transformOrigin: "bottom center",
                  transition: "transform 180ms cubic-bezier(.22,.61,.36,1)",
                  zIndex: can ? 40 + i : i,
                }}
              >
                <Card
                  card={c}
                  dim={myTurn && !can}
                  fresh={fresh}
                  onClick={can ? () => play(c) : undefined}
                />
              </div>
            );
          });
        })()}
      </div>

      {/* Drew a card you can play: take it or leave it. */}
      {myTurn && b.must_play_or_pass && (
        <button
          type="button"
          onClick={() => onAction({ action: "pass" })}
          className="mt-1 h-11 rounded-[12px] border text-sm font-semibold"
          style={{
            borderColor: "color-mix(in srgb, var(--color-text-secondary) 45%, transparent)",
            color: "var(--color-text-primary)",
          }}
        >
          Keep it and pass
        </button>
      )}

      {/* The ending. "You went out" made people ask whether they had won; this
          says which, and holds long enough to land before the results page. */}
      <AnimatePresence>
        {b.winner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex flex-col items-center justify-center px-8"
            style={{ background: "rgba(5,6,10,0.88)", backdropFilter: "blur(6px)" }}
          >
            {/* The winner's last card bursting outward. */}
            {iWon &&
              Array.from({ length: 10 }).map((_, i) => {
                const a = (i / 10) * Math.PI * 2;
                return (
                  <motion.div
                    key={i}
                    initial={{ x: 0, y: 0, opacity: 0, rotate: 0, scale: 0.5 }}
                    animate={{
                      x: Math.cos(a) * 190,
                      y: Math.sin(a) * 190,
                      opacity: [0, 1, 0],
                      rotate: (i % 2 ? 1 : -1) * 220,
                      scale: 1,
                    }}
                    transition={{ duration: 1.5, delay: 0.1 + i * 0.03, ease: "easeOut" }}
                    className="pointer-events-none absolute rounded-[7px]"
                    style={{
                      width: 34,
                      height: 50,
                      background: [SUIT.r, SUIT.y, SUIT.g, SUIT.b][i % 4],
                    }}
                  />
                );
              })}

            <motion.div
              initial={{ scale: 0.6, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 240, damping: 16 }}
              className="relative text-center"
            >
              <div
                className="font-[var(--font-display)] text-6xl font-bold leading-none"
                style={{ color: iWon ? "var(--color-success)" : "var(--color-warm)" }}
              >
                {iWon ? "You win" : "You lose"}
              </div>
              <div className="mt-3 font-[var(--font-body)] text-base text-[var(--color-text-secondary)]">
                {iWon
                  ? `${oppName} was left holding ${oppCount} ${oppCount === 1 ? "card" : "cards"}.`
                  : `${oppName} emptied their hand first.`}
              </div>
              {(b.scores?.[meId ?? ""] ?? 0) > 0 && (
                <div
                  className="mt-4 font-[var(--font-display)] text-3xl font-bold"
                  style={{ color: "var(--color-primary)" }}
                >
                  +{b.scores[meId ?? ""]}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cards in transit. Rendered above everything and ignoring pointer
          events, so a flight never blocks a tap. */}
      <AnimatePresence>
        {flights.map((f) => (
          <motion.div
            key={f.key}
            initial={{ x: f.from.x - HAND_W / 2, y: f.from.y - HAND_H / 2, scale: 0.86, opacity: 0 }}
            animate={{ x: f.to.x - HAND_W / 2, y: f.to.y - HAND_H / 2, scale: f.scaleTo, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.42, delay: f.delay, ease: [0.22, 0.61, 0.36, 1] }}
            onAnimationComplete={() =>
              setFlights((cur) => cur.filter((x) => x.key !== f.key))
            }
            className="pointer-events-none fixed left-0 top-0 z-40"
            style={{ width: HAND_W, height: HAND_H }}
          >
            {f.card ? (
              <Card card={f.card} />
            ) : (
              <CardBack w={HAND_W} h={HAND_H} />
            )}
          </motion.div>
        ))}
      </AnimatePresence>

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
                    className="h-16 rounded-[12px] font-[var(--font-display)] font-bold capitalize"
                    style={{ background: SUIT[c], color: "#05060a" }}
                  >
                    {COLOR_NAME[c]}
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
