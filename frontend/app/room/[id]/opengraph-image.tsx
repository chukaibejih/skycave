import { ImageResponse } from "next/og";

// Server-rendered (fetches the room's public info); Node runtime for unrestricted
// fetch, matching the other card routes.
export const runtime = "nodejs";
export const alt = "Skycave game invite";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const BASE = "#05060a";
const INK = "#f5f7ff";
const MUTED = "#9aa3ba";

// Per-game accent (literal hex, since Satori can't resolve CSS vars), plus the
// short code chip and the game's own tagline. Mirrors gameVisual + the game
// classes so an invite looks like the game it's for.
const ACCENT: Record<string, string> = {
  geoguess: "#8b7cff", color_clash: "#ff725e", flag_rush: "#56f0aa", outline_quiz: "#67e8f9",
  word_duel: "#ffd166", reaction_grid: "#8b7cff", mad_math: "#ffd166", word_hunt: "#67e8f9",
  tile_takeover: "#56f0aa", connect4: "#ffd166", dots_boxes: "#67e8f9", clay: "#ff725e",
  uno: "#8b7cff", mancala: "#ffd166", crossing: "#8b7cff", freeze: "#67e8f9",
};
const CODE: Record<string, string> = {
  geoguess: "GEO", color_clash: "CLR", flag_rush: "FLG", outline_quiz: "OUT", word_duel: "WRD",
  reaction_grid: "RXN", mad_math: "MTH", word_hunt: "HNT", tile_takeover: "TKO", connect4: "C4",
  dots_boxes: "D&B", clay: "CLY", uno: "UNO", mancala: "MNC", crossing: "CRX", freeze: "FRZ",
};
const TAGLINE: Record<string, string> = {
  connect4: "Drop discs. Line up four.",
  word_hunt: "Trace words in the grid. Biggest haul wins.",
  word_duel: "Same 6 letters. Make the most, highest total wins.",
  freeze: "Stop it as close to the target as you can.",
  uno: "Match colour or number. First to empty their hand wins.",
  tile_takeover: "Flood the board. Claim the most tiles.",
  mancala: "Sow the seeds. Bank the most.",
  clay: "Shape the spinning pot to match the target. Closest wins.",
  dots_boxes: "Close a box, go again. Most boxes wins.",
  color_clash: "Tap the ink color, not the word. First correct wins.",
  flag_rush: "Name the country. First correct takes the point.",
  geoguess: "Drop a pin. Closest to the target wins the round.",
  outline_quiz: "Name the country from its outline. First correct wins.",
  reaction_grid: "Watch the sequence, tap it back. First correct wins.",
  mad_math: "Solve it first. Rapid mental math.",
  crossing: "Race your three across. No jumping.",
};

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let gameType = "";
  let gameName = "a game";
  let host = "";
  try {
    const r = await fetch(`${API}/rooms/${id}`, { cache: "no-store" });
    if (r.ok) {
      const room = (await r.json()) as {
        game_type?: string;
        game_name?: string;
        host_handle?: string;
      };
      gameType = room.game_type || "";
      gameName = room.game_name || gameName;
      host = (room.host_handle || "").replace(/^@+/, "");
      if (host.toLowerCase() === "guest") host = ""; // guest hosts have no real handle
    }
  } catch {
    // Fall through: a framed invite still beats a broken card.
  }

  const accent = ACCENT[gameType] || "#8b7cff";
  const code = CODE[gameType] || "";
  const tagline = TAGLINE[gameType] || "";
  const inviter = host ? `@${host} wants to play you` : "You've been challenged";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: BASE,
          position: "relative",
          padding: 76,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(58% 80% at 86% 12%, ${accent}2e, transparent 70%)`,
            display: "flex",
          }}
        />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 12, height: 12, borderRadius: 12, background: accent, display: "flex" }} />
            <div style={{ display: "flex", fontSize: 25, fontWeight: 700, letterSpacing: 6, textTransform: "uppercase", color: MUTED }}>
              Game Invite
            </div>
          </div>

          <div style={{ display: "flex", fontSize: 42, fontWeight: 600, color: INK, marginTop: 30 }}>
            {inviter}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 6 }}>
            <div style={{ display: "flex", fontSize: 100, fontWeight: 800, color: accent, letterSpacing: -2 }}>
              {gameName}
            </div>
            {code ? (
              <div
                style={{
                  display: "flex",
                  fontSize: 28,
                  fontWeight: 800,
                  letterSpacing: 2,
                  color: accent,
                  border: `2px solid ${accent}`,
                  borderRadius: 14,
                  padding: "8px 16px",
                }}
              >
                {code}
              </div>
            ) : null}
          </div>

          {tagline ? (
            <div style={{ display: "flex", fontSize: 32, color: MUTED, marginTop: 16 }}>{tagline}</div>
          ) : null}

          <div style={{ flex: 1, display: "flex" }} />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", fontSize: 32, fontWeight: 800, color: accent }}>Tap in to play →</div>
            <div style={{ display: "flex", fontSize: 27, color: MUTED, letterSpacing: 1 }}>skycave.space</div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
