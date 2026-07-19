"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { shareToBluesky } from "@/lib/bluesky";
import { useAuth, useRoom } from "@/lib/store";

// Clay's gameplay is a canvas; the server issues the target and scores the
// submitted pot. This ports the prototype renderer (proven) and drives the
// mutable game state through refs so shaping never triggers React re-renders.

const GLAZES = ["#c0503b", "#8b7cff", "#67e8f9", "#ffd166", "#f5f7ff", "#2e7d5b"];

interface Target {
  name: string;
  radius: number[];
  glaze: (string | null)[];
}
interface Sim {
  name: string; // kept here so the result survives round_data being cleared
  ROWS: number;
  MAXR: number;
  yTop: number;
  yBot: number;
  potH: number;
  prof: number[];
  glaze: (string | null)[];
  target: number[];
  tglaze: (string | null)[];
  stability: number;
  collapsed: boolean;
  slump: number;
  collapseSide: number;
  spin: number;
  pointer: { x: number; y: number } | null;
  offset: number; // active shaping offset (0 for mouse, OFFSET_Y for touch)
  moveSpeed: number;
  lastMove: number;
  glazeColor: string | null;
}

const CLAY_MIN = 9;
const THIN = 16;
const MINWALL = 2;
const OFFSET_Y = 44; // touch shaping happens this many px ABOVE the fingertip

export function Clay() {
  const roundData = useRoom((s) => s.roundData) as
    | { target?: Target; rows?: number; max_r?: number; glazes?: string[]; round_time?: number }
    | null;
  const roundEndsAt = useRoom((s) => s.roundEndsAt);
  const gameEnd = useRoom((s) => s.gameEnd);
  const sendAction = useRoom((s) => s.sendAction);
  const room = useRoom((s) => s.room);
  const sendRematch = useRoom((s) => s.sendRematch);
  const rematchRequestedBy = useRoom((s) => s.rematchRequestedBy);
  const meId = useAuth((s) => s.identity?.id);

  const isSolo = (room?.players.length ?? 1) === 1;
  const target = roundData?.target ?? null;
  const roundSecs = roundData?.round_time ?? 45;

  // The canvas unmounts between rounds (loading state, result screen). A plain
  // ref isn't reactive, so effects bound to it would never re-run when a NEW
  // canvas mounted — that's what left the wheel unresponsive after game one.
  // A state-backed callback ref makes "the element attached" an actual dep.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const setCanvas = useCallback((el: HTMLCanvasElement | null) => {
    canvasRef.current = el;
    setCanvasEl(el);
  }, []);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const S = useRef<Sim | null>(null);
  const cardRef = useRef<HTMLCanvasElement | null>(null);
  const submittedRef = useRef(false);
  const [glazeColor, setGlazeColor] = useState<string | null>(null);
  const [hud, setHud] = useState({ match: 0, stability: 100, time: 0 });
  const [phase, setPhase] = useState<"play" | "fired">("play");
  const [collapsed, setCollapsed] = useState(false);
  const collapsedRef = useRef(false);
  const [sharing, setSharing] = useState(false);
  // Handlers read the phase through a ref so gating never depends on when the
  // listeners were bound (no stale closure, no rebinding needed).
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // ---- init the sim when the target arrives ----
  useEffect(() => {
    // Only (re)build the clay when a round is actually OPEN. GAME_END clears the
    // deadline, and re-initialising on that wiped the finished pot before the
    // share card was drawn — the card showed a fresh mound instead of your work.
    if (!target || roundEndsAt == null) return;
    const ROWS = roundData?.rows ?? 64;
    const MAXR = roundData?.max_r ?? 132;
    const yTop = 46;
    const yBot = 424;
    const prof: number[] = [];
    const glaze: (string | null)[] = [];
    for (let i = 0; i < ROWS; i++) {
      const t = i / (ROWS - 1);
      prof[i] = t < 0.58 ? 2 : Math.max(2, MAXR * 0.44 * Math.sin(((t - 0.58) / 0.42) * (Math.PI / 2)));
      glaze[i] = null;
    }
    S.current = {
      name: target.name,
      ROWS,
      MAXR,
      yTop,
      yBot,
      potH: yBot - yTop,
      prof,
      glaze,
      target: target.radius,
      tglaze: target.glaze,
      stability: 1,
      collapsed: false,
      slump: 0,
      collapseSide: 1,
      spin: 0,
      pointer: null,
      offset: 0,
      moveSpeed: 0,
      lastMove: 0,
      glazeColor: null,
    };
    submittedRef.current = false;
    setPhase("play");
    setCollapsed(false);
    collapsedRef.current = false;
    // Keyed on the round's deadline, not just the target name: two games can
    // draw the same pot, and keying on the name alone left the second one stuck
    // in "fired" (dead clay) because this reset never ran.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.name, roundEndsAt, roundData?.rows]);

  useEffect(() => {
    if (S.current) S.current.glazeColor = glazeColor;
  }, [glazeColor]);

  const submitPot = useCallback(
    (final: boolean) => {
      const s = S.current;
      if (!s) return;
      if (submittedRef.current) return;
      sendAction({
        profile: s.prof.map((r) => Math.round(r * 100) / 100),
        glaze: s.glaze,
        stability: s.stability,
        collapsed: s.collapsed,
        fired: final,
      });
      if (final) {
        submittedRef.current = true;
        setPhase("fired");
      }
    },
    [sendAction]
  );

  // Solo streams its pot so the server always has a fresh score before its
  // timer fires; 1v1 must submit exactly once (the action is immutable server
  // side), so it only sends on fire / auto-fire.
  useEffect(() => {
    if (!isSolo || phase !== "play") return;
    const iv = setInterval(() => {
      const s = S.current;
      if (s && !submittedRef.current) {
        sendAction({ profile: s.prof.map((r) => Math.round(r * 100) / 100), glaze: s.glaze, stability: s.stability, collapsed: s.collapsed, fired: false });
      }
    }, 1500);
    return () => clearInterval(iv);
  }, [isSolo, phase, sendAction]);

  // ---- canvas sizing ----
  useEffect(() => {
    const resize = () => {
      const c = canvasRef.current;
      const st = stageRef.current;
      if (!c || !st) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const w = st.clientWidth;
      c.width = Math.round(w * dpr);
      c.height = Math.round(470 * dpr);
      c.style.height = "470px";
      const ctx = c.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [canvasEl]);

  // ---- pointer shaping ----
  useEffect(() => {
    const c = canvasEl;
    if (!c) return;
    const pos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      const s = S.current;
      if (!s || s.collapsed || phaseRef.current !== "play") return;
      e.preventDefault();
      // A mouse cursor is precise, so no offset; a finger shapes above itself.
      s.offset = e.pointerType === "mouse" ? 0 : OFFSET_Y;
      s.pointer = pos(e);
      s.lastMove = performance.now();
    };
    const move = (e: PointerEvent) => {
      const s = S.current;
      if (!s || !s.pointer || s.collapsed || phaseRef.current !== "play") return;
      e.preventDefault();
      const p = pos(e);
      const now = performance.now();
      const dt = Math.max(1, now - s.lastMove);
      const dist = Math.hypot(p.x - s.pointer.x, p.y - s.pointer.y);
      s.moveSpeed = 0.7 * s.moveSpeed + 0.3 * ((dist / dt) * 16);
      shapeAt(s, c.clientWidth / 2, p.x, p.y, dist);
      s.pointer = p;
      s.lastMove = now;
    };
    const up = () => {
      if (S.current) S.current.pointer = null;
    };
    c.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      c.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [canvasEl]);

  // ---- animation + physics loop ----
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const s = S.current;
      const ctx = canvasRef.current?.getContext("2d");
      if (s && ctx) {
        const dt = Math.min(50, now - last);
        s.spin += dt * 0.004;
        if (s.collapsed) {
          s.slump = Math.min(1.2, s.slump + dt * 0.0011);
          // Flip React state once, not every frame.
          if (!collapsedRef.current) {
            collapsedRef.current = true;
            setCollapsed(true);
          }
          // A collapse used to leave the player staring at a dead wheel until
          // the clock ran out. Once the fall has played, send what's left and
          // move on to the result.
          if (s.slump >= 1.15 && !submittedRef.current) submitPot(true);
        }
        else if (phase === "play") stepPhysics(s, dt);
        draw(ctx, s, canvasRef.current!.clientWidth, 470, phase);

        // Timer + auto-fire. roundEndsAt is Unix-epoch seconds, so compare it to
        // Date.now() (NOT the rAF clock). A null deadline means the round hasn't
        // opened yet and must never read as "time is up" — treating it as 0 used
        // to auto-fire an untouched pot the instant a second game started.
        const left =
          roundEndsAt != null ? Math.max(0, roundEndsAt - Date.now() / 1000) : null;
        if (phase === "play" && left !== null && left <= 0.8 && !submittedRef.current) {
          submitPot(true);
        }
        setHud((h) => {
          const match = s.collapsed ? 0 : Math.round(shapeMatch(s) * 100);
          const stab = Math.round(s.stability * 100);
          const time = Math.ceil(left ?? roundSecs);
          return h.match === match && h.stability === stab && h.time === time ? h : { match, stability: stab, time };
        });
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, roundEndsAt, roundSecs, submitPot]);

  // Draw the share card (TARGET vs YOURS + score) once the game ends.
  useEffect(() => {
    if (!gameEnd || !S.current || !cardRef.current) return;
    drawCard(cardRef.current, S.current, gameEnd.scores[meId ?? ""] ?? 0, S.current.name);
  }, [gameEnd, meId]);

  const fire = () => submitPot(true);

  const myScore = gameEnd ? gameEnd.scores[meId ?? ""] ?? 0 : 0;
  const opp = room?.players.find((p) => p.id !== meId) ?? null;
  const oppScore = gameEnd && opp ? gameEnd.scores[opp.id] ?? 0 : null;
  // A finished room stops sending round_data, so lean on the sim's own copy.
  const potName = S.current?.name ?? target?.name ?? "your pot";

  const shareLine = isSolo
    ? `Shaped a ${potName} on Clay · ${myScore} pts.`
    : gameEnd?.winner_id === meId
      ? `Won a Clay pot-off · ${myScore} pts.`
      : `Clay pot-off · ${myScore} pts.`;

  /**
   * Share the actual pot, not a line of text. Bluesky's web composer can't take
   * an attached image, so we hand the PNG to the OS share sheet (which Bluesky
   * accepts as a real image post). Where that isn't available we save the file
   * and open the composer so it can be attached by hand.
   */
  const shareCard = async () => {
    const text = `${shareLine}\n\nskycave.space`;
    const canvas = cardRef.current;
    if (!canvas) return shareToBluesky(text);
    setSharing(true);
    try {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (blob) {
        const file = new File([blob], "clay-pot.png", { type: "image/png" });
        if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], text });
          return; // shared with the picture attached
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "clay-pot.png";
        a.click();
        URL.revokeObjectURL(url);
      }
      shareToBluesky(text);
    } catch (e) {
      // Dismissing the share sheet is a normal outcome, not a failure.
      if ((e as Error)?.name !== "AbortError") shareToBluesky(text);
    } finally {
      setSharing(false);
    }
  };

  // ---- result: a full screen, matching the other game-over pages ----
  if (gameEnd) {
    const iRequested = rematchRequestedBy.includes(meId ?? "");
    const oppRequested = !!opp && rematchRequestedBy.includes(opp.id);
    const headline = isSolo
      ? "Fired."
      : gameEnd.winner_id === meId
        ? "You win."
        : gameEnd.winner_id == null
          ? "Draw."
          : `${opp?.display_name ?? "Opponent"} wins.`;
    return (
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-5 py-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
        >
          <h1 className="font-[var(--font-display)] text-5xl font-bold leading-none">{headline}</h1>
          <p className="mt-3 font-[var(--font-mono)] text-sm text-[var(--color-text-secondary)]">
            <span className="font-[var(--font-display)] text-base font-bold" style={{ color: "var(--color-primary)" }}>
              {myScore.toLocaleString()}
            </span>{" "}
            points · {potName}
          </p>

          {/* The pot itself is the result — target beside yours. */}
          <canvas
            ref={cardRef}
            width={1280}
            height={720}
            className="mt-5 w-full rounded-[14px] border border-[var(--color-border)]"
          />

          {!isSolo && oppScore != null && (
            <div className="mt-5 flex flex-col gap-2">
              <ScoreRow name="You" score={myScore} lead={myScore >= oppScore} />
              <ScoreRow name={opp?.display_name ?? "Opponent"} score={oppScore} lead={oppScore > myScore} />
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2.5">
            <button
              onClick={shareCard}
              disabled={sharing}
              className="flex h-[52px] w-full items-center justify-center rounded-[12px] text-base font-semibold transition-[filter] active:brightness-95 disabled:opacity-60"
              style={{ background: "var(--color-primary)", color: "#05060a" }}
            >
              {sharing ? "Preparing your pot..." : "Share your pot"}
            </button>
            <div className="flex items-center justify-center gap-4 pt-1">
              {isSolo ? (
                <a
                  href="/play/clay"
                  className="flex h-12 items-center justify-center rounded-[12px] border px-6 text-base"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                >
                  Play again
                </a>
              ) : (
                // Same room, same opponent — the rematch keeps a 1v1 alive
                // instead of dumping both players back to the hub.
                <button
                  onClick={sendRematch}
                  disabled={iRequested || !opp}
                  className="flex h-12 items-center justify-center rounded-[12px] border px-6 text-base disabled:opacity-60"
                  style={{
                    borderColor: oppRequested && !iRequested ? "var(--color-primary)" : "var(--color-border)",
                    color: "var(--color-text-primary)",
                  }}
                >
                  {iRequested ? "Waiting..." : oppRequested ? "Accept rematch" : "Rematch"}
                </button>
              )}
              <Link href="/" className="flex h-12 items-center justify-center px-3 text-sm text-[var(--color-text-secondary)]">
                hub
              </Link>
            </div>
            {oppRequested && !iRequested && (
              <p className="text-center text-sm" style={{ color: "var(--color-primary)" }}>
                {opp?.display_name} wants a rematch.
              </p>
            )}
          </div>
        </motion.div>
      </main>
    );
  }

  // Only a round that hasn't opened yet shows the loader — checked AFTER the
  // result, so returning to a finished game never lands back on "centering".
  if (!target) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center font-[var(--font-display)] text-2xl text-[var(--color-text-secondary)]">
        centering the clay...
      </div>
    );
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col justify-center px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
      <div className="flex items-center gap-4 py-3">
        <Stat v={`${hud.match}%`} l="match" color={hud.match > 90 ? "var(--color-success)" : hud.match > 70 ? "var(--color-gold)" : "var(--color-text-primary)"} />
        <Stat v={`${hud.time}`} l="seconds" color={hud.time <= 10 ? "var(--color-warm)" : "var(--color-text-primary)"} />
        <div className="flex-1">
          <div className="mb-1 flex justify-between font-[var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
            <span>stability</span>
            <span>{hud.stability}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full border border-[var(--color-border)] bg-[#0c0f17]">
            <div
              className="h-full rounded-full transition-[width]"
              style={{ width: `${hud.stability}%`, background: hud.stability > 50 ? "var(--color-success)" : hud.stability > 25 ? "var(--color-gold)" : "var(--color-warm)" }}
            />
          </div>
        </div>
      </div>

      <div ref={stageRef} className="relative overflow-hidden rounded-[18px] border border-[var(--color-border)]" style={{ background: "radial-gradient(120% 90% at 50% 15%, #1b2030 0%, #0b0e16 70%)", touchAction: "none" }}>
        <canvas ref={setCanvas} className="block w-full" />

        {/* A collapse must say what happened and where it's going. */}
        {collapsed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[rgba(5,6,10,.72)] p-6 text-center backdrop-blur-sm">
            <b className="font-[var(--font-display)] text-2xl font-bold" style={{ color: "var(--color-warm)" }}>
              It collapsed.
            </b>
            <span className="max-w-[260px] text-sm text-[var(--color-text-secondary)]">
              The wall went too thin, too fast. Slow, even pressure keeps a pot standing.
            </span>
            <span className="mt-1 font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
              {isSolo ? "firing what's left..." : "sending it to your opponent..."}
            </span>
          </div>
        )}

      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={fire}
          disabled={phase !== "play"}
          className="rounded-[10px] px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: "var(--color-primary)", color: "#05060a" }}
        >
          {phase === "play" ? "Fire it" : "fired"}
        </button>
        <div className="ml-auto flex gap-1.5">
          {(roundData?.glazes ?? GLAZES).map((c) => (
            <button
              key={c}
              onClick={() => setGlazeColor(glazeColor === c ? null : c)}
              aria-label="glaze color"
              className="h-7 w-7 rounded-[8px] border-2"
              style={{ background: c, borderColor: glazeColor === c ? "var(--color-text-primary)" : "transparent" }}
            />
          ))}
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-[var(--color-text-secondary)]">
        Target: <b className="text-[var(--color-text-primary)]">{target.name}</b> · drag to shape · tap a glaze then drag to paint · go slow or it collapses
      </p>
    </main>
  );
}

function ScoreRow({ name, score, lead }: { name: string; score: number; lead: boolean }) {
  return (
    <div
      className="flex items-center justify-between rounded-[10px] border px-4 py-2.5"
      style={{ borderColor: lead ? "var(--color-primary)" : "var(--color-border)" }}
    >
      <span className="truncate text-sm" style={{ color: lead ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}>
        {name}
      </span>
      <span className="font-[var(--font-mono)] text-base font-semibold">{score.toLocaleString()}</span>
    </div>
  );
}

function Stat({ v, l, color }: { v: string; l: string; color: string }) {
  return (
    <div style={{ minWidth: 48 }}>
      <div className="font-[var(--font-display)] text-2xl font-bold leading-none" style={{ color }}>{v}</div>
      <div className="mt-1 font-[var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">{l}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sim helpers (ported from the prototype; operate on the mutable Sim object)
// ---------------------------------------------------------------------------
const rowY = (s: Sim, i: number) => s.yTop + (i / (s.ROWS - 1)) * s.potH;
const yToRow = (s: Sim, y: number) => Math.max(0, Math.min(s.ROWS - 1, Math.round(((y - s.yTop) / s.potH) * (s.ROWS - 1))));

function shapeAt(s: Sim, centerX: number, px: number, py: number, dist: number) {
  const i0 = yToRow(s, py - s.offset); // shape above the fingertip (offset touch)
  const desired = Math.max(MINWALL, Math.min(s.MAXR, Math.abs(px - centerX)));
  const strength = Math.min(0.6, 0.22 + dist * 0.02);
  const BRUSH = 6;
  for (let j = Math.max(0, i0 - BRUSH); j <= Math.min(s.ROWS - 1, i0 + BRUSH); j++) {
    const w = Math.exp(-Math.pow((j - i0) / (BRUSH * 0.6), 2));
    s.prof[j] += (desired - s.prof[j]) * w * strength;
    s.prof[j] = Math.max(MINWALL, Math.min(s.MAXR, s.prof[j]));
    if (s.glazeColor && s.prof[j] >= CLAY_MIN && Math.abs(Math.abs(px - centerX) - s.prof[j]) < 26) s.glaze[j] = s.glazeColor;
  }
}

function shapeMatch(s: Sim) {
  let sum = 0;
  for (let i = 0; i < s.ROWS; i++) sum += Math.abs(s.prof[i] - s.target[i]);
  return Math.max(0, Math.min(1, 1 - sum / s.ROWS / (0.34 * s.MAXR)));
}

function stepPhysics(s: Sim, dt: number) {
  let thin = 0;
  for (let i = 0; i < s.ROWS; i++) if (s.prof[i] >= CLAY_MIN && s.prof[i] < THIN) thin += (THIN - s.prof[i]) / THIN;
  const speedDrain = Math.max(0, s.moveSpeed - 6) * 0.01;
  const thinDrain = thin * 0.01;
  const regen = s.pointer ? 0.004 : 0.01;
  s.stability = Math.max(0, Math.min(1, s.stability - (speedDrain + thinDrain) * dt * 0.06 + regen * dt * 0.06));
  s.moveSpeed *= 0.92;
  if (s.stability <= 0 && !s.collapsed) {
    s.collapsed = true;
    s.slump = 0;
    s.collapseSide = Math.random() < 0.5 ? -1 : 1;
  }
}

function topRow(s: Sim) {
  for (let i = 0; i < s.ROWS; i++) if (s.prof[i] >= CLAY_MIN) return i;
  return s.ROWS - 1;
}
// How far the collapse has played out, 0..1.
const slumpK = (s: Sim) => (s.collapsed ? Math.min(1, s.slump) : 0);

/**
 * Row height during a collapse. Clay that gives way falls DOWN onto the wheel —
 * it loses height and puddles. Previously the pot kept full height while leaning
 * a third of the canvas sideways, which read as a spike launching off the wheel.
 */
function rowYS(s: Sim, i: number) {
  const y = rowY(s, i);
  const k = slumpK(s);
  return k ? s.yBot - (s.yBot - y) * (1 - 0.72 * k) : y;
}

function bend(s: Sim, i: number) {
  if (!s.collapsed) return 0;
  const t = i / (s.ROWS - 1);
  // A lean that fades toward the base, not a launch off the wheel.
  return s.collapseSide * slumpK(s) * Math.pow(1 - t, 1.6) * s.MAXR * 0.26;
}
function dispR(s: Sim, i: number) {
  const fragile = (1 - s.stability) * (s.prof[i] < THIN ? 1.7 : 0.5);
  let r = s.prof[i];
  if (s.collapsed) {
    const k = slumpK(s);
    const t = i / (s.ROWS - 1);
    // Mass drops: the wall thins near the rim and spreads into a puddle at the foot.
    r = s.prof[i] * (1 - 0.45 * k * (1 - t)) * (1 + 0.85 * k * t);
    r += Math.sin(s.spin * 3 + i * 0.6) * s.prof[i] * 0.05 * k;
  } else if (fragile > 0.02) {
    r += Math.sin(s.spin * 2.4 + i * 0.55) * fragile * 7;
  }
  return Math.max(1, r);
}

const PI2 = Math.PI * 2;
function draw(ctx: CanvasRenderingContext2D, s: Sim, W: number, H: number, _phase: string) {
  const cx = W / 2;
  const colX = (i: number) => cx + bend(s, i);
  ctx.clearRect(0, 0, W, H);
  const baseR = dispR(s, s.ROWS - 1);

  // wheel + contact shadow
  const wy = s.yBot + 14;
  const wr = s.MAXR * 1.0;
  const wth = 20;
  let cs = ctx.createRadialGradient(cx, s.yBot + 7, 4, cx, s.yBot + 7, baseR * 1.9);
  cs.addColorStop(0, "rgba(0,0,0,.6)");
  cs.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = cs;
  ctx.beginPath();
  ctx.ellipse(cx, s.yBot + 8, baseR * 1.9, 22, 0, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#0a0906";
  ctx.beginPath();
  ctx.ellipse(cx, wy + wth, wr, 15, 0, 0, PI2);
  ctx.fill();
  ctx.fillStyle = "#120f0b";
  ctx.fillRect(cx - wr, wy, wr * 2, wth);
  const wtop = ctx.createLinearGradient(cx - wr, 0, cx + wr, 0);
  wtop.addColorStop(0, "#0d0b08");
  wtop.addColorStop(0.5, "#1d1812");
  wtop.addColorStop(1, "#0d0b08");
  ctx.fillStyle = wtop;
  ctx.beginPath();
  ctx.ellipse(cx, wy, wr, 15, 0, 0, PI2);
  ctx.fill();

  // ghost target — start at the target's first real clay row so short forms
  // (bowls, cups) don't trail a sliver up to the top of the wheel.
  if (!s.collapsed) {
    let g0 = 0;
    while (g0 < s.ROWS - 1 && s.target[g0] < CLAY_MIN) g0++;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx + s.target[g0], rowY(s, g0));
    for (let i = g0 + 1; i < s.ROWS; i++) ctx.lineTo(cx + s.target[i], rowY(s, i));
    for (let i = s.ROWS - 1; i >= g0; i--) ctx.lineTo(cx - s.target[i], rowY(s, i));
    ctx.closePath();
    ctx.setLineDash([4, 7]);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = "rgba(103,232,249,.42)";
    ctx.stroke();
    ctx.restore();
  }

  // pot body
  const t0 = topRow(s);
  const potPath = () => {
    ctx.beginPath();
    ctx.moveTo(colX(t0) + dispR(s, t0), rowYS(s, t0));
    for (let i = t0 + 1; i < s.ROWS; i++) ctx.lineTo(colX(i) + dispR(s, i), rowYS(s, i));
    for (let i = s.ROWS - 1; i >= t0; i--) ctx.lineTo(colX(i) - dispR(s, i), rowYS(s, i));
    ctx.closePath();
  };
  ctx.save();
  potPath();
  ctx.clip();
  const base = ctx.createLinearGradient(cx - s.MAXR, 0, cx + s.MAXR, 0);
  base.addColorStop(0, "#4a1c12");
  base.addColorStop(0.34, "#a8402a");
  base.addColorStop(0.46, "#e0714f");
  base.addColorStop(0.62, "#b84a30");
  base.addColorStop(1, "#54200f");
  ctx.fillStyle = base;
  ctx.fillRect(cx - s.MAXR - 4, 0, s.MAXR * 2 + 8, H);
  for (let i = 0; i < s.ROWS; i++) {
    if (!s.glaze[i]) continue;
    ctx.globalAlpha = 0.62;
    ctx.fillStyle = s.glaze[i] as string;
    ctx.fillRect(cx - s.MAXR - 4, rowYS(s, i) - s.potH / s.ROWS / 2, s.MAXR * 2 + 8, s.potH / s.ROWS + 1.4);
  }
  ctx.globalAlpha = 1;
  const vg = ctx.createLinearGradient(0, s.yTop, 0, s.yBot + 10);
  vg.addColorStop(0, "rgba(255,240,230,.12)");
  vg.addColorStop(0.45, "rgba(0,0,0,0)");
  vg.addColorStop(0.85, "rgba(20,6,2,.22)");
  vg.addColorStop(1, "rgba(10,3,1,.4)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  const sx = cx - s.MAXR * 0.26 + Math.sin(s.spin) * s.MAXR * 0.14;
  const sy = s.yTop + s.potH * 0.24;
  const rad = ctx.createRadialGradient(sx, sy, 3, sx, sy, s.MAXR * 0.95);
  rad.addColorStop(0, "rgba(255,247,240,.5)");
  rad.addColorStop(0.45, "rgba(255,240,230,.12)");
  rad.addColorStop(1, "rgba(255,240,230,0)");
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";
  if (s.pointer && !s.collapsed) {
    const py2 = s.pointer.y - s.offset;
    const d = ctx.createRadialGradient(s.pointer.x, py2, 1, s.pointer.x, py2, 26);
    d.addColorStop(0, "rgba(0,0,0,.3)");
    d.addColorStop(0.6, "rgba(0,0,0,.1)");
    d.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = d;
    ctx.fillRect(s.pointer.x - 28, py2 - 28, 56, 56);
  }
  ctx.restore();

  // rim
  const r0 = dispR(s, t0);
  const cxi = colX(t0);
  const yr = rowYS(s, t0);
  const wall = Math.max(5, Math.min(17, r0 * 0.16));
  const ir = Math.max(2, r0 - wall);
  ctx.fillStyle = "#8a3620";
  ctx.beginPath();
  ctx.ellipse(cxi, yr, r0, r0 * 0.24, 0, 0, PI2);
  ctx.fill();
  const cav = ctx.createRadialGradient(cxi - wall * 0.4, yr - 2, 2, cxi, yr, Math.max(3, ir));
  cav.addColorStop(0, "#180a06");
  cav.addColorStop(0.7, "#2a120b");
  cav.addColorStop(1, "#431c11");
  ctx.fillStyle = cav;
  ctx.beginPath();
  ctx.ellipse(cxi, yr, ir, ir * 0.24, 0, 0, PI2);
  ctx.fill();
  potPath();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "rgba(0,0,0,.4)";
  ctx.stroke();

  // offset-touch handle: a cyan control dot ABOVE the fingertip, linked down to
  // it — so the finger never covers the point being shaped or the ghost there.
  if (s.pointer && !s.collapsed && s.offset > 0) {
    const py2 = s.pointer.y - s.offset;
    ctx.strokeStyle = "rgba(103,232,249,.6)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(s.pointer.x, s.pointer.y);
    ctx.lineTo(s.pointer.x, py2 + 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s.pointer.x, py2, 6, 0, PI2);
    ctx.stroke();
  }

  if (!s.collapsed) drawRef(ctx, s, W);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A small colored render of the target pot (the "reference image").
function miniPot(ctx: CanvasRenderingContext2D, s: Sim, cxp: number, w: number, h: number, P: number[], G: (string | null)[]) {
  const yt = 6;
  const ph = h - 12;
  const scale = (w * 0.4) / s.MAXR;
  let t0 = 0;
  while (t0 < s.ROWS - 1 && P[t0] < CLAY_MIN) t0++;
  const R = (i: number) => P[i] * scale;
  const Y = (i: number) => yt + (i / (s.ROWS - 1)) * ph;
  ctx.beginPath();
  ctx.moveTo(cxp + R(t0), Y(t0));
  for (let i = t0 + 1; i < s.ROWS; i++) ctx.lineTo(cxp + R(i), Y(i));
  for (let i = s.ROWS - 1; i >= t0; i--) ctx.lineTo(cxp - R(i), Y(i));
  ctx.closePath();
  ctx.save();
  ctx.clip();
  const base = ctx.createLinearGradient(cxp - w / 2, 0, cxp + w / 2, 0);
  base.addColorStop(0, "#4a1c12");
  base.addColorStop(0.4, "#b84a30");
  base.addColorStop(0.5, "#e0714f");
  base.addColorStop(0.62, "#b84a30");
  base.addColorStop(1, "#54200f");
  ctx.fillStyle = base;
  ctx.fillRect(cxp - w / 2, 0, w, h);
  for (let i = t0; i < s.ROWS; i++) {
    if (!G[i]) continue;
    ctx.globalAlpha = 0.62;
    ctx.fillStyle = G[i] as string;
    ctx.fillRect(cxp - w / 2, Y(i) - 2, w, ph / s.ROWS + 2);
  }
  ctx.globalAlpha = 1;
  const vg = ctx.createLinearGradient(0, yt, 0, yt + ph);
  vg.addColorStop(0, "rgba(255,240,230,.14)");
  vg.addColorStop(0.5, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,.3)");
  ctx.fillStyle = vg;
  ctx.fillRect(cxp - w / 2, 0, w, h);
  ctx.restore();
  const r0 = R(t0);
  ctx.fillStyle = "#2a120b";
  ctx.beginPath();
  ctx.ellipse(cxp, Y(t0), r0, r0 * 0.22, 0, 0, PI2);
  ctx.fill();
}

// Pinned colored TARGET reference in the top-left corner (opposite the rim).
function drawRef(ctx: CanvasRenderingContext2D, s: Sim, W: number) {
  const pw = 74;
  const ph = 104;
  const px = 10;
  const py = 10;
  ctx.save();
  ctx.fillStyle = "rgba(8,10,16,.82)";
  roundRect(ctx, px, py, pw, ph, 10);
  ctx.fill();
  ctx.strokeStyle = "rgba(40,48,68,.9)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.save();
  ctx.translate(px, py + 2);
  miniPot(ctx, s, pw / 2, pw, ph - 22, s.target, s.tglaze);
  ctx.restore();
  ctx.fillStyle = "#9aa3ba";
  ctx.font = "600 9px 'Geist Mono', ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText("TARGET", px + pw / 2, py + ph - 7);
  ctx.textAlign = "left";
  ctx.restore();
  void W;
}

// The shareable score card: TARGET vs YOURS pots side by side + the score.
function drawCard(canvas: HTMLCanvasElement, s: Sim, score: number, name: string) {
  const g = canvas.getContext("2d");
  if (!g) return;
  // Drawn in a 640x360 layout but rasterised at 2x, so the PNG people actually
  // post is crisp on a phone screen.
  const SCALE = 2;
  const CW = canvas.width / SCALE;
  const CH = canvas.height / SCALE;
  g.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  const bg = g.createLinearGradient(0, 0, CW, CH);
  bg.addColorStop(0, "#0b0e16");
  bg.addColorStop(1, "#12101a");
  g.fillStyle = bg;
  g.fillRect(0, 0, CW, CH);
  g.fillStyle = "rgba(139,124,255,.16)";
  g.fillRect(0, 0, CW, 6);
  g.textBaseline = "alphabetic";
  g.fillStyle = "#f5f7ff";
  g.font = "700 30px system-ui, sans-serif";
  g.fillText("Clay", 30, 52);
  g.fillStyle = "#9aa3ba";
  g.font = "500 17px ui-monospace, monospace";
  g.fillText(name, 30, 80);
  g.fillStyle = "#8b7cff";
  g.font = "800 52px system-ui, sans-serif";
  g.textAlign = "right";
  g.fillText(String(score), CW - 30, 64);
  g.fillStyle = "#9aa3ba";
  g.font = "500 14px ui-monospace, monospace";
  g.fillText("points", CW - 30, 86);
  g.textAlign = "left";
  miniPotAt(g, s, CW * 0.32, 108, 150, 208, s.target, s.tglaze, "TARGET");
  miniPotAt(g, s, CW * 0.68, 108, 150, 208, s.prof, s.glaze, "YOURS");
  g.fillStyle = "#5c657c";
  g.font = "500 14px ui-monospace, monospace";
  g.textAlign = "center";
  g.fillText("skycave.space", CW / 2, CH - 16);
  g.textAlign = "left";
}
function miniPotAt(g: CanvasRenderingContext2D, s: Sim, cxp: number, top: number, w: number, h: number, P: number[], G: (string | null)[], label: string) {
  g.save();
  g.translate(0, top);
  miniPot(g, s, cxp, w, h, P, G);
  g.restore();
  g.fillStyle = "#9aa3ba";
  g.font = "600 13px ui-monospace, monospace";
  g.textAlign = "center";
  g.fillText(label, cxp, top + h + 18);
  g.textAlign = "left";
}
