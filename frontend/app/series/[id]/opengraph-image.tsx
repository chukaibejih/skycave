import { ImageResponse } from "next/og";

// Server-rendered (fetches the series' public info); Node runtime for
// unrestricted fetch, matching the other card routes.
export const runtime = "nodejs";
export const alt = "Skycave series invite";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const BASE = "#05060a";
const INK = "#f5f7ff";
const MUTED = "#9aa3ba";
const VIOLET = "#8b7cff";
const CYAN = "#67e8f9";

function realName(n: string | undefined): string {
  const name = (n || "").trim();
  if (!name) return "";
  if (["guest", "player"].includes(name.toLowerCase())) return "";
  return name;
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let winsNeeded = 2;
  let games: string[] = [];
  let challenger = "";
  let status = "open";
  try {
    const r = await fetch(`${API}/series/${id}`, { cache: "no-store" });
    if (r.ok) {
      const s = (await r.json()) as {
        wins_needed?: number;
        game_names?: string[];
        player1?: { name?: string };
        status?: string;
      };
      winsNeeded = s.wins_needed || 2;
      games = s.game_names || [];
      challenger = realName(s.player1?.name);
      status = s.status || "open";
    }
  } catch {
    // Fall through: a framed invite still beats a broken card.
  }

  const best = winsNeeded * 2 - 1;
  const headline =
    status === "finished"
      ? "This series is decided"
      : challenger
        ? `${challenger} challenges you`
        : "You've been challenged";

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
        {/* Series brand glow: violet into cyan, the gradient the FAB uses. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(60% 80% at 88% 10%, ${VIOLET}33, transparent 70%)`,
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(50% 70% at 6% 96%, ${CYAN}22, transparent 70%)`,
            display: "flex",
          }}
        />

        <div style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 12, height: 12, borderRadius: 12, background: CYAN, display: "flex" }} />
            <div
              style={{
                display: "flex",
                fontSize: 25,
                fontWeight: 700,
                letterSpacing: 6,
                textTransform: "uppercase",
                color: MUTED,
              }}
            >
              Series · Best of {best}
            </div>
          </div>

          <div style={{ display: "flex", fontSize: 76, fontWeight: 800, color: INK, marginTop: 30, letterSpacing: -1 }}>
            {headline}
          </div>
          <div style={{ display: "flex", fontSize: 34, color: MUTED, marginTop: 14 }}>
            First to {winsNeeded} wins, across {games.length || best} random games.
          </div>

          {/* The lineup, as chips, so the card previews exactly what's coming. */}
          {games.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 34 }}>
              {games.map((g, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    fontSize: 28,
                    fontWeight: 700,
                    color: INK,
                    border: `2px solid ${VIOLET}66`,
                    borderRadius: 16,
                    padding: "12px 20px",
                    background: `${VIOLET}14`,
                  }}
                >
                  <div style={{ display: "flex", fontSize: 22, fontWeight: 800, color: CYAN }}>{i + 1}</div>
                  {g}
                </div>
              ))}
            </div>
          ) : null}

          <div style={{ flex: 1, display: "flex" }} />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", fontSize: 32, fontWeight: 800, color: CYAN }}>Tap in to play →</div>
            <div style={{ display: "flex", fontSize: 27, color: MUTED, letterSpacing: 1 }}>skycave.space</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
