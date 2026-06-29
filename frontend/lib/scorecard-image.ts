// Client-side score card image generation.
//
// The card is a purely client artifact (no server storage) — we draw it on a
// canvas and let the user download a PNG. Matches the ScoreCard layout + the
// "midnight arcade" palette. Uses only the Canvas API, no dependencies.
import type { PlayerSlot } from "./types";

interface CardData {
  gameName: string;
  players: PlayerSlot[];
  scores: Record<string, number>;
  history: { round: number; points: Record<string, number> }[];
  winnerId: string | null;
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
  ctx.fillText(trunc(ctx, p1?.display_name ?? "—", 380), 120, 175);
  ctx.textAlign = "right";
  ctx.fillStyle = C.warm;
  ctx.fillText(trunc(ctx, p2?.display_name ?? "—", 380), W - 120, 175);
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

  // Final score
  ctx.font = "700 96px system-ui, sans-serif";
  const s1 = String(p1 ? data.scores[p1.id] ?? 0 : 0);
  const s2 = String(p2 ? data.scores[p2.id] ?? 0 : 0);
  const mid = W / 2;
  ctx.textAlign = "right";
  ctx.fillStyle = C.primary;
  ctx.fillText(s1, mid - 50, 470);
  ctx.textAlign = "center";
  ctx.fillStyle = C.muted;
  ctx.fillText("—", mid, 470);
  ctx.textAlign = "left";
  ctx.fillStyle = C.warm;
  ctx.fillText(s2, mid + 50, 470);

  // Winner
  ctx.textAlign = "center";
  ctx.fillStyle = C.success;
  ctx.font = "600 32px system-ui, sans-serif";
  ctx.fillText(winner ? `${winner.display_name} wins` : "draw", W / 2, 530);

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
