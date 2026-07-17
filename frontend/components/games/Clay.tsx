"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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
  moveSpeed: number;
  lastMove: number;
  glazeColor: string | null;
}

const CLAY_MIN = 9;
const THIN = 16;
const MINWALL = 2;

export function Clay() {
  const roundData = useRoom((s) => s.roundData) as
    | { target?: Target; rows?: number; max_r?: number }
    | null;
  const roundEndsAt = useRoom((s) => s.roundEndsAt);
  const gameEnd = useRoom((s) => s.gameEnd);
  const sendAction = useRoom((s) => s.sendAction);
  const room = useRoom((s) => s.room);
  const meId = useAuth((s) => s.identity?.id);

  const isSolo = (room?.players.length ?? 1) === 1;
  const target = roundData?.target ?? null;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const S = useRef<Sim | null>(null);
  const submittedRef = useRef(false);
  const [glazeColor, setGlazeColor] = useState<string | null>(null);
  const [hud, setHud] = useState({ match: 0, stability: 100, time: 0 });
  const [phase, setPhase] = useState<"play" | "fired">("play");

  // ---- init the sim when the target arrives ----
  useEffect(() => {
    if (!target) return;
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
      moveSpeed: 0,
      lastMove: 0,
      glazeColor: null,
    };
    submittedRef.current = false;
    setPhase("play");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.name, roundData?.rows]);

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
  }, [target?.name]);

  // ---- pointer shaping ----
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const pos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      const s = S.current;
      if (!s || s.collapsed || phase !== "play") return;
      e.preventDefault();
      s.pointer = pos(e);
      s.lastMove = performance.now();
    };
    const move = (e: PointerEvent) => {
      const s = S.current;
      if (!s || !s.pointer || s.collapsed || phase !== "play") return;
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
  }, [phase]);

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
        if (s.collapsed) s.slump = Math.min(1.2, s.slump + dt * 0.0016);
        else if (phase === "play") stepPhysics(s, dt);
        draw(ctx, s, canvasRef.current!.clientWidth, 470, phase);

        // timer + auto-fire
        const left = roundEndsAt ? Math.max(0, roundEndsAt - now / 1000) : 0;
        if (phase === "play" && left <= 0.8 && !submittedRef.current) submitPot(true);
        setHud((h) => {
          const match = s.collapsed ? 0 : Math.round(shapeMatch(s) * 100);
          const stab = Math.round(s.stability * 100);
          const time = Math.ceil(left);
          return h.match === match && h.stability === stab && h.time === time ? h : { match, stability: stab, time };
        });
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, roundEndsAt, submitPot]);

  const fire = () => submitPot(true);

  if (!target) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center font-[var(--font-display)] text-2xl text-[var(--color-text-secondary)]">
        centering the clay...
      </div>
    );
  }

  const myScore = gameEnd ? gameEnd.scores[meId ?? ""] ?? 0 : null;
  const oppId = room?.players.find((p) => p.id !== meId)?.id;
  const oppScore = gameEnd && oppId ? gameEnd.scores[oppId] ?? 0 : null;
  const outcome =
    gameEnd == null
      ? null
      : isSolo
        ? "fired"
        : gameEnd.winner_id === meId
          ? "you win"
          : gameEnd.winner_id == null
            ? "a draw"
            : "you lose";

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
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
        <canvas ref={canvasRef} className="block w-full" />

        {gameEnd && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[rgba(5,6,10,.82)] p-6 text-center backdrop-blur-sm">
            <b className="font-[var(--font-display)] text-xl font-bold">{outcome}</b>
            <div className="font-[var(--font-display)] text-5xl font-extrabold" style={{ color: "var(--color-primary)" }}>{myScore}</div>
            {!isSolo && oppScore != null && (
              <div className="font-[var(--font-mono)] text-sm text-[var(--color-text-secondary)]">you {myScore} · opponent {oppScore}</div>
            )}
            <div className="mt-2 flex gap-2">
              {isSolo && (
                <a
                  href="/play/clay"
                  className="grid h-11 place-items-center rounded-[12px] px-5 text-sm font-semibold"
                  style={{ background: "var(--color-primary)", color: "#05060a" }}
                >
                  Play again
                </a>
              )}
              <Link href="/" className="grid h-11 place-items-center rounded-[12px] border px-5 text-sm font-semibold" style={{ borderColor: "var(--color-border)" }}>
                Hub
              </Link>
            </div>
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
          {GLAZES.map((c) => (
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
  const i0 = yToRow(s, py);
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
function bend(s: Sim, i: number) {
  if (!s.collapsed) return 0;
  const t = i / (s.ROWS - 1);
  return s.collapseSide * s.slump * Math.pow(1 - t, 1.6) * s.MAXR * 0.85;
}
function dispR(s: Sim, i: number) {
  const fragile = (1 - s.stability) * (s.prof[i] < THIN ? 1.7 : 0.5);
  let r = s.prof[i];
  if (s.collapsed) {
    r = s.prof[i] * Math.max(0.15, 1 - s.slump * 0.8);
    r += Math.sin(s.spin * 3 + i * 0.6) * s.prof[i] * 0.12 * Math.min(1, s.slump * 2);
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

  // ghost target
  if (!s.collapsed) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx + s.target[0], rowY(s, 0));
    for (let i = 1; i < s.ROWS; i++) ctx.lineTo(cx + s.target[i], rowY(s, i));
    for (let i = s.ROWS - 1; i >= 0; i--) ctx.lineTo(cx - s.target[i], rowY(s, i));
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
    ctx.moveTo(colX(t0) + dispR(s, t0), rowY(s, t0));
    for (let i = t0 + 1; i < s.ROWS; i++) ctx.lineTo(colX(i) + dispR(s, i), rowY(s, i));
    for (let i = s.ROWS - 1; i >= t0; i--) ctx.lineTo(colX(i) - dispR(s, i), rowY(s, i));
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
    ctx.fillRect(cx - s.MAXR - 4, rowY(s, i) - s.potH / s.ROWS / 2, s.MAXR * 2 + 8, s.potH / s.ROWS + 1.4);
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
    const d = ctx.createRadialGradient(s.pointer.x, s.pointer.y, 1, s.pointer.x, s.pointer.y, 28);
    d.addColorStop(0, "rgba(0,0,0,.32)");
    d.addColorStop(0.6, "rgba(0,0,0,.1)");
    d.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = d;
    ctx.fillRect(s.pointer.x - 30, s.pointer.y - 30, 60, 60);
  }
  ctx.restore();

  // rim
  const r0 = dispR(s, t0);
  const cxi = colX(t0);
  const yr = rowY(s, t0);
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
}
