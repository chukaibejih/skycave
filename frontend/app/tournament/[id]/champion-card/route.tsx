import { ImageResponse } from "next/og";

// Rendered server-side (fetches the champion + their avatar), so keep it on the
// Node runtime where Buffer and unrestricted fetch are available.
export const runtime = "nodejs";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const BASE = "#05060a";
const SURFACE = "#10131c";
const BORDER = "#283044";
const INK = "#f5f7ff";
const MUTED = "#8b93ad";
const GOLD = "#f2c14e";

/**
 * The shareable "champion" card for a finished tournament, posted alongside the
 * champion announcement. Mirrors the on-site ChampionMoment: gold "CHAMPION"
 * eyebrow, the winner's avatar crowned and gold-ringed, their name, and the
 * event underneath. 1200x630 so it embeds cleanly on Bluesky.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let data: {
    name?: string;
    champion?: { display_name?: string; handle?: string; avatar_url?: string | null };
  } | null = null;
  try {
    const r = await fetch(`${API}/tournaments/${id}`, { cache: "no-store" });
    if (r.ok) data = await r.json();
  } catch {
    /* fall through to 404 */
  }

  const champ = data?.champion;
  if (!champ) {
    return new Response("no champion yet", { status: 404 });
  }
  const name = champ.display_name || champ.handle || "Champion";
  const handle = champ.handle ? `@${champ.handle}` : "";
  const event = (data?.name || "Skycave Weekend Tournament").toUpperCase();

  // Inline the avatar as a data URI so Satori never has to fetch it mid-render.
  // Bluesky's CDN serves webp by default, which Satori cannot decode; the
  // `@jpeg` suffix forces a JPEG variant it can render.
  let avatar: string | null = null;
  if (champ.avatar_url) {
    let src = champ.avatar_url;
    if (src.includes("cdn.bsky.app/img/") && !/@(jpeg|png|webp)$/.test(src)) {
      src = `${src}@jpeg`;
    }
    try {
      const ar = await fetch(src);
      if (ar.ok) {
        const buf = Buffer.from(await ar.arrayBuffer());
        const ct = ar.headers.get("content-type") || "image/jpeg";
        avatar = `data:${ct};base64,${buf.toString("base64")}`;
      }
    } catch {
      /* fall back to an initial */
    }
  }

  const AV = 240;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: BASE,
          position: "relative",
        }}
      >
        {/* Gold light behind the champion */}
        <div
          style={{
            position: "absolute",
            top: 40,
            width: 700,
            height: 500,
            background: GOLD,
            opacity: 0.14,
            filter: "blur(150px)",
            display: "flex",
          }}
        />

        <div style={{ display: "flex", fontSize: 26, letterSpacing: 10, color: GOLD, fontWeight: 700 }}>
          CHAMPION
        </div>

        {/* Crown above the avatar, gold ring around it. A column (not absolute
            positioning) keeps the crown reliably centered over the avatar across
            renderers. The crown is SVG (not the 👑 emoji) so it always renders. */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: "20px 0 30px" }}>
          <svg width="82" height="82" viewBox="0 0 24 24" fill={GOLD} stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 8 }}>
            <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14" />
          </svg>
          {avatar ? (
            <img
              src={avatar}
              width={AV}
              height={AV}
              style={{ width: AV, height: AV, borderRadius: AV, border: `6px solid ${GOLD}`, objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                width: AV,
                height: AV,
                borderRadius: AV,
                border: `6px solid ${GOLD}`,
                background: SURFACE,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: INK,
                fontSize: 110,
                fontWeight: 700,
              }}
            >
              {name.trim().charAt(0).toUpperCase() || "?"}
            </div>
          )}
        </div>

        <div style={{ display: "flex", fontSize: 72, fontWeight: 700, color: INK, letterSpacing: -1, maxWidth: 1040, textAlign: "center" }}>
          {name}
        </div>
        {handle ? (
          <div style={{ display: "flex", fontSize: 30, color: MUTED, marginTop: 10 }}>{handle}</div>
        ) : null}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 44,
            border: `1px solid ${BORDER}`,
            background: SURFACE,
            borderRadius: 999,
            padding: "10px 24px",
            color: GOLD,
            fontSize: 22,
            letterSpacing: 2,
          }}
        >
          {event}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
