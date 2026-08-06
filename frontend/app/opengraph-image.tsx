import { ImageResponse } from "next/og";

/**
 * The card skycave.space becomes when the link is shared. Until now the
 * homepage had a title and no image, which on Bluesky is a grey box with some
 * text. This makes a shared link carry the identity: the wordmark, the "games
 * for the whole sky" line, and a taste of the games.
 *
 * Static and self-contained - no network fetch - so a crawler that times out
 * still gets the card.
 */
export const alt = "Skycave: games for Bluesky, Blacksky, and beyond";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BASE = "#05060a";
const SURFACE = "#10131c";
const BORDER = "#283044";
const INK = "#f5f7ff";
const MUTED = "#8b93ad";
const PRIMARY = "#8b7cff";
const CYAN = "#67e8f9";

const GAMES = [
  "Tile Takeover",
  "Uno",
  "Connect 4",
  "Word Hunt",
  "Mancala",
  "Clay",
  "GeoGuess",
  "Color Clash",
];

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BASE,
          padding: 72,
          position: "relative",
        }}
      >
        {/* Violet lifts from one corner, cyan from the other - the hub's own two
            lights, so the card reads as the same product. */}
        <div
          style={{
            position: "absolute",
            top: -220,
            left: -160,
            width: 760,
            height: 560,
            background: PRIMARY,
            opacity: 0.18,
            filter: "blur(130px)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -260,
            right: -120,
            width: 700,
            height: 520,
            background: CYAN,
            opacity: 0.1,
            filter: "blur(130px)",
            display: "flex",
          }}
        />

        <div style={{ display: "flex" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              border: `1px solid ${CYAN}`,
              borderRadius: 999,
              padding: "10px 22px",
              color: CYAN,
              fontSize: 22,
              letterSpacing: 3,
              textTransform: "uppercase",
            }}
          >
            <div style={{ width: 12, height: 12, borderRadius: 999, background: CYAN, display: "flex" }} />
            Multiplayer game hub
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", fontSize: 124, fontWeight: 700, letterSpacing: -3, lineHeight: 1 }}>
            <span style={{ color: INK }}>sky</span>
            <span style={{ color: PRIMARY }}>cave</span>
          </div>
          <div style={{ display: "flex", fontSize: 46, fontWeight: 600, color: INK, letterSpacing: -1 }}>
            Games for Bluesky, Blacksky, and beyond.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {GAMES.map((g) => (
              <div
                key={g}
                style={{
                  display: "flex",
                  background: SURFACE,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 999,
                  padding: "8px 18px",
                  color: MUTED,
                  fontSize: 24,
                }}
              >
                {g}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", color: MUTED, fontSize: 30, letterSpacing: 1 }}>skycave.space</div>
            <div style={{ display: "flex", color: MUTED, fontSize: 26 }}>no account needed</div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
