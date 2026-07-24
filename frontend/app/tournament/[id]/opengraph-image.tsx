import { ImageResponse } from "next/og";
import { colorFor, initials } from "@/lib/avatar";

/**
 * The card the bracket link becomes on Bluesky.
 *
 * The whole tournament is built on the idea that its URL travels, and until now
 * that URL had a title and no image, which on Bluesky is a grey box with some
 * text in it. This makes the link carry the event: who is in it, how far along
 * it is, and who won.
 *
 * Deliberately no remote avatars. Real profile pictures would look better, but
 * they mean one network fetch per player inside card generation, and a crawler
 * that times out gets no card at all. Initial discs are drawn from the same
 * palette and the same hash the app uses, so a player's colour here is the
 * colour they already have on the bracket.
 */
export const alt = "Skycave tournament bracket";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const BASE = "#05060a";
const SURFACE = "#10131c";
const BORDER = "#283044";
const INK = "#f5f7ff";
const MUTED = "#8b93ad";
const PRIMARY = "#8b7cff";
const CYAN = "#67e8f9";
const GOLD = "#ffd166";

export default async function Image({ params }: { params: { id: string } }) {
  let t: {
    name?: string;
    status?: string;
    entrants?: number;
    max_players?: number;
    spots_left?: number;
    rounds?: number;
    players?: { did: string; display_name: string }[];
    champion?: { did: string; display_name: string; handle: string } | null;
    matches?: { status: string }[];
  } | null = null;

  try {
    const res = await fetch(`${API}/tournaments/${params.id}`, { cache: "no-store" });
    if (res.ok) t = await res.json();
  } catch {
    // Fall through to the generic card. A card that says "Skycave" beats a
    // crawler getting a 500 and showing nothing at all.
  }

  const champion = t?.champion ?? null;
  const players = (t?.players ?? []).slice(0, 8);
  const left = (t?.matches ?? []).filter(
    (m) => m.status !== "done" && m.status !== "bye"
  ).length;

  const headline = champion
    ? `${champion.display_name} wins.`
    : (t?.name ?? "Skycave Weekend Tournament");

  const sub =
    t?.status === "registering"
      ? `${t.spots_left} of ${t.max_players} spots left`
      : champion
        ? `${t?.entrants ?? 0} entered. One left standing.`
        : t
          ? `${t.entrants} in the draw · ${left} ${left === 1 ? "match" : "matches"} to play`
          : "One weekend. Straight knockout.";

  const accent = champion ? GOLD : t?.status === "registering" ? PRIMARY : CYAN;

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
          padding: 64,
          position: "relative",
        }}
      >
        {/* A wash of the accent, so the card's mood matches its state at a
            glance: purple while entries are open, cyan mid-event, gold once
            somebody has won it. */}
        <div
          style={{
            position: "absolute",
            top: -260,
            left: 380,
            width: 900,
            height: 620,
            background: accent,
            opacity: 0.16,
            filter: "blur(120px)",
            display: "flex",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              border: `1px solid ${accent}`,
              borderRadius: 999,
              padding: "10px 22px",
              color: accent,
              fontSize: 22,
              letterSpacing: 3,
              textTransform: "uppercase",
            }}
          >
            {champion ? "Champion" : "Weekend tournament"}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              display: "flex",
              fontSize: champion ? 92 : 76,
              fontWeight: 700,
              color: INK,
              lineHeight: 1.05,
              letterSpacing: -2,
            }}
          >
            {headline}
          </div>
          <div style={{ display: "flex", fontSize: 34, color: MUTED }}>{sub}</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {(champion ? [champion] : players).map((p, i) => (
              <div
                key={p.did}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: champion ? 92 : 72,
                  height: champion ? 92 : 72,
                  borderRadius: 999,
                  background: colorFor(p.did),
                  color: "#ffffff",
                  fontSize: champion ? 34 : 26,
                  fontWeight: 700,
                  marginLeft: i === 0 ? 0 : -18,
                  border: `4px solid ${champion ? GOLD : BASE}`,
                }}
              >
                {initials(p.display_name)}
              </div>
            ))}
            {!champion && (t?.entrants ?? 0) > players.length && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 72,
                  height: 72,
                  borderRadius: 999,
                  background: SURFACE,
                  border: `1px solid ${BORDER}`,
                  color: MUTED,
                  fontSize: 24,
                  fontWeight: 700,
                  marginLeft: -18,
                }}
              >
                +{(t?.entrants ?? 0) - players.length}
              </div>
            )}
          </div>

          <div style={{ display: "flex", fontSize: 30, color: MUTED, letterSpacing: 1 }}>
            skycave.space
          </div>
        </div>
      </div>
    ),
    size
  );
}
