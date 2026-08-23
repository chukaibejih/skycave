// Client-side score card image generation.
//
// The card is a purely client artifact (no server storage) - we draw it on a
// canvas and let the user download a PNG. Matches the ScoreCard layout + the
// "midnight arcade" palette. Uses only the Canvas API, no dependencies.
import type { PlayerSlot } from "./types";

interface CardData {
  gameName: string;
  players: PlayerSlot[];
  scores: Record<string, number>;
  history: { round: number; points: Record<string, number> }[];
  winnerId: string | null;
  // Wins per player across every game in this room. A series is the result
  // worth posting; the last game's score alone discards the rest of it.
  series?: Record<string, number>;
}

const C = {
  base: "#0A0A0F",
  surface: "#13131A",
  border: "#2A2A3A",
  primary: "#6C63FF",
  warm: "#FF6B6B",
  success: "#4FFFB0",
  text: "#F0F0FF",
  muted: "#8888AA",
};

export function renderScoreCard(data: CardData): HTMLCanvasElement {
  const W = 1200;
  const H = 630; // OG-image aspect ratio (1.91:1)
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background + ambient glow
  ctx.fillStyle = C.base;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, W * 0.6);
  glow.addColorStop(0, "rgba(108,99,255,0.22)");
  glow.addColorStop(1, "rgba(108,99,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const p1 = data.players[0];
  const p2 = data.players[1];
  const winner = data.players.find((p) => p.id === data.winnerId);

  ctx.textAlign = "center";

  // Header
  ctx.fillStyle = C.muted;
  ctx.font = "600 26px system-ui, sans-serif";
  ctx.fillText(data.gameName.toUpperCase(), W / 2, 80);

  // Names
  ctx.font = "700 44px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = C.primary;
  ctx.fillText(trunc(ctx, p1?.display_name ?? "-", 380), 120, 175);
  ctx.textAlign = "right";
  ctx.fillStyle = C.warm;
  ctx.fillText(trunc(ctx, p2?.display_name ?? "-", 380), W - 120, 175);
  ctx.textAlign = "center";
  ctx.fillStyle = C.muted;
  ctx.font = "400 28px system-ui, sans-serif";
  ctx.fillText("vs", W / 2, 172);

  // Round breakdown
  const rounds = data.history;
  if (rounds.length) {
    const colW = Math.min(80, (W - 240) / rounds.length);
    const startX = W / 2 - (colW * rounds.length) / 2 + colW / 2;
    ctx.font = "700 22px ui-monospace, monospace";
    rounds.forEach((h, i) => {
      const x = startX + i * colW;
      ctx.fillStyle = C.muted;
      ctx.font = "500 16px ui-monospace, monospace";
      ctx.fillText(`R${h.round}`, x, 250);
      ctx.font = "700 22px ui-monospace, monospace";
      ctx.fillStyle = C.primary;
      ctx.fillText(String(h.points[p1?.id] ?? 0), x, 290);
      ctx.fillStyle = C.warm;
      ctx.fillText(String(h.points[p2?.id] ?? 0), x, 322);
    });
  }

  // The result. Once more than one game has been decided in this room, the
  // series tally is the headline and this game's score becomes a detail line.
  const w1 = data.series?.[p1?.id ?? ""] ?? 0;
  const w2 = data.series?.[p2?.id ?? ""] ?? 0;
  const isSeries = w1 + w2 > 1;
  const gameScore1 = p1 ? data.scores[p1.id] ?? 0 : 0;
  const gameScore2 = p2 ? data.scores[p2.id] ?? 0 : 0;

  if (isSeries) {
    ctx.textAlign = "center";
    ctx.fillStyle = C.muted;
    ctx.font = "500 20px ui-monospace, monospace";
    ctx.fillText(`SERIES · ${w1 + w2} GAMES`, W / 2, 352);
  }

  ctx.font = "700 96px system-ui, sans-serif";
  const s1 = String(isSeries ? w1 : gameScore1);
  const s2 = String(isSeries ? w2 : gameScore2);
  const mid = W / 2;
  ctx.textAlign = "right";
  const scoreY = isSeries ? 452 : 470;
  ctx.fillStyle = C.primary;
  ctx.fillText(s1, mid - 50, scoreY);
  ctx.textAlign = "center";
  ctx.fillStyle = C.muted;
  ctx.fillText("-", mid, scoreY);
  ctx.textAlign = "left";
  ctx.fillStyle = C.warm;
  ctx.fillText(s2, mid + 50, scoreY);

  // Who is ahead, and (in a series) what this game did.
  ctx.textAlign = "center";
  if (isSeries) {
    const leader = w1 === w2 ? null : w1 > w2 ? p1 : p2;
    ctx.fillStyle = leader ? (leader === p1 ? C.primary : C.warm) : C.success;
    ctx.font = "600 32px system-ui, sans-serif";
    ctx.fillText(
      leader ? `${leader.display_name} leads the series` : "series tied",
      W / 2,
      508
    );
    ctx.fillStyle = C.muted;
    ctx.font = "500 22px ui-monospace, monospace";
    ctx.fillText(
      `this game ${gameScore1}-${gameScore2}` +
        (winner ? ` to ${winner.display_name}` : ""),
      W / 2,
      546
    );
  } else {
    ctx.fillStyle = C.success;
    ctx.font = "600 32px system-ui, sans-serif";
    ctx.fillText(winner ? `${winner.display_name} wins` : "draw", W / 2, 530);
  }

  // Footer
  ctx.fillStyle = C.muted;
  ctx.font = "500 22px ui-monospace, monospace";
  ctx.textAlign = "left";
  ctx.fillText("Skycave", 120, H - 50);
  ctx.textAlign = "right";
  ctx.fillText("skycave.space", W - 120, H - 50);

  return canvas;
}

function trunc(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

export function downloadScoreCard(data: CardData, filename = "skycave-scorecard.png") {
  const canvas = renderScoreCard(data);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

// ── Series result card ──
// A whole head-to-head series on one card: the final set score, who took it,
// and the game-by-game lineup. Same palette and canvas-only approach as above.
export interface SeriesLeg {
  name: string;
  winner: "p1" | "p2" | "draw";
}
export interface SeriesCardData {
  p1Name: string;
  p2Name: string;
  p1Wins: number;
  p2Wins: number;
  winnerName: string | null; // null = level
  best: number; // games in the series (bo3 = 3)
  legs: SeriesLeg[];
}

export function renderSeriesCard(data: SeriesCardData): HTMLCanvasElement {
  const W = 1200;
  const H = 630;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = C.base;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.85, 0, 0, W * 0.85, 0, W * 0.7);
  glow.addColorStop(0, "rgba(108,99,255,0.22)");
  glow.addColorStop(1, "rgba(108,99,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const p1Lead = data.p1Wins > data.p2Wins;
  const p2Lead = data.p2Wins > data.p1Wins;

  // Eyebrow
  ctx.textAlign = "left";
  ctx.fillStyle = C.muted;
  ctx.font = "700 26px system-ui, sans-serif";
  ctx.fillText(`SERIES · BEST OF ${data.best}`, 120, 96);

  // Headline
  ctx.fillStyle = C.text;
  ctx.font = "800 66px system-ui, sans-serif";
  const head = data.winnerName ? `${trunc(ctx, data.winnerName, 780)} takes it.` : "It ends level.";
  ctx.fillText(head, 120, 180);

  // The scoreline: NAME  wins - wins  NAME
  const midY = 300;
  ctx.font = "700 40px system-ui, sans-serif";
  ctx.fillStyle = p1Lead ? C.success : C.text;
  ctx.textAlign = "left";
  ctx.fillText(trunc(ctx, data.p1Name, 360), 120, midY);
  ctx.fillStyle = p2Lead ? C.success : C.text;
  ctx.textAlign = "right";
  ctx.fillText(trunc(ctx, data.p2Name, 360), W - 120, midY);

  ctx.textAlign = "center";
  ctx.font = "800 84px system-ui, sans-serif";
  ctx.fillStyle = C.text;
  ctx.fillText(`${data.p1Wins} - ${data.p2Wins}`, W / 2, midY + 14);

  // The lineup, one row per game, with who took it.
  let y = 388;
  ctx.font = "600 28px system-ui, sans-serif";
  for (let i = 0; i < data.legs.length; i++) {
    const leg = data.legs[i];
    ctx.textAlign = "left";
    ctx.fillStyle = C.muted;
    ctx.fillText(`${i + 1}`, 120, y);
    ctx.fillStyle = C.text;
    ctx.fillText(trunc(ctx, leg.name, 560), 168, y);
    ctx.textAlign = "right";
    if (leg.winner === "draw") {
      ctx.fillStyle = C.muted;
      ctx.fillText("drawn", W - 120, y);
    } else {
      const who = leg.winner === "p1" ? data.p1Name : data.p2Name;
      ctx.fillStyle = C.success;
      ctx.fillText(trunc(ctx, `${who} won`, 420), W - 120, y);
    }
    y += 52;
  }

  // Footer
  ctx.fillStyle = C.muted;
  ctx.font = "500 22px ui-monospace, monospace";
  ctx.textAlign = "left";
  ctx.fillText("Skycave", 120, H - 44);
  ctx.textAlign = "right";
  ctx.fillText("skycave.space", W - 120, H - 44);

  return canvas;
}

export function downloadSeriesCard(data: SeriesCardData, filename = "skycave-series.png") {
  const canvas = renderSeriesCard(data);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}
