import { ImageResponse } from "next/og";
import { TOURNEY } from "@/lib/tournamentStatus";

// Rendered server-side (fetches the tournament's registration-close time), so
// keep it on the Node runtime where full Intl (timezone formatting) and
// unrestricted fetch are available.
export const runtime = "nodejs";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * The shareable "registration is open" card, posted alongside the signup
 * announcement (the fortnightly rotate). Square (1200x1200) so it fills the
 * Bluesky feed rather than getting letterboxed.
 *
 * The scene and every colour come from `TOURNEY` (lib/tournamentStatus), so a
 * tournament skin swap re-themes this card with zero changes here: swap the palette,
 * the announcement card follows. The countdown is computed from the tournament's
 * real registration-close time, in Pacific, at render (post) time.
 */
function closeParts(iso?: string): { days: number; weekday: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86_400_000));
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "America/Los_Angeles",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    timeZone: "America/Los_Angeles",
  }).format(d); // e.g. "12 PM"
  return { days, weekday, time };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let closesAt: string | undefined;
  try {
    const r = await fetch(`${API}/tournaments/${id}`, { cache: "no-store" });
    if (r.ok) {
      const t = (await r.json()) as { registration_closes_at?: string };
      closesAt = t.registration_closes_at;
    }
  } catch {
    // Fall through: a card that frames the event still beats no card at all.
  }
  const c = closeParts(closesAt);

  // The same layered canopy as the live entry points, enlarged for the square
  // feed card. SVG keeps leaf silhouettes and light shafts crisp at 1200px.
  const jungle = (
    <svg
      width="1200"
      height="1200"
      viewBox="0 0 1200 1200"
      style={{ position: "absolute", left: 0, top: 0, display: "flex" }}
    >
      <path d="M0 0H1200V270C1050 208 958 298 797 228C640 159 514 288 356 221C196 153 91 245 0 317Z" fill={TOURNEY.leafDeep} />
      <path d="M0 165C126 57 242 148 321 262C192 310 80 320 0 366ZM1200 158C1073 53 953 150 871 266C999 313 1102 319 1200 370Z" fill={TOURNEY.leaf} />
      <path d="M110 0L350 1200H480L373 0ZM724 0L932 1200H1060L970 0Z" fill={TOURNEY.shaft} opacity="0.10" />
      <path d="M0 955C212 868 365 1009 556 926C750 841 1002 1008 1200 893V1200H0Z" fill={TOURNEY.ground} opacity="0.72" />
    </svg>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          background: TOURNEY.sky,
          fontFamily: "sans-serif",
          overflow: "hidden",
        }}
      >
        {jungle}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 300,
            background: `linear-gradient(180deg, transparent 0%, ${TOURNEY.mist} 100%)`,
            opacity: 0.16,
            display: "flex",
          }}
        />

        {/* content */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            flex: 1,
            padding: 96,
          }}
        >
          <div style={{ display: "flex" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                background: TOURNEY.panel,
                color: TOURNEY.ink,
                padding: "12px 22px",
                borderRadius: 999,
                fontSize: 27,
                fontWeight: 700,
                letterSpacing: 3,
                textTransform: "uppercase",
                border: `1px solid ${TOURNEY.accent}`,
              }}
            >
              <div
                style={{ width: 15, height: 15, borderRadius: 15, background: TOURNEY.coral, display: "flex" }}
              />
              Weekend Event
            </div>
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 100,
              fontWeight: 800,
              color: TOURNEY.ink,
              letterSpacing: -2,
              lineHeight: 1.03,
              marginTop: 36,
              maxWidth: 920,
            }}
          >
            Skycave Weekend Tournament
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 39,
              fontWeight: 600,
              color: TOURNEY.accentSoft,
              marginTop: 26,
            }}
          >
            Free to enter · 1v1 weekend bracket · Crowned Monday
          </div>

          <div style={{ display: "flex", flex: 1 }} />

          {c ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignSelf: "flex-start",
                background: TOURNEY.panel,
                border: `1px solid ${TOURNEY.accent}`,
                borderRadius: 26,
                padding: "28px 38px",
                color: TOURNEY.ink,
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: 25,
                  fontWeight: 700,
                  letterSpacing: 4,
                  textTransform: "uppercase",
                  color: TOURNEY.accentSoft,
                }}
              >
                Registration closes in
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 18, marginTop: 10 }}>
                <div style={{ display: "flex", fontSize: 104, fontWeight: 800, lineHeight: 1 }}>{c.days}</div>
                <div style={{ display: "flex", fontSize: 44, fontWeight: 700, paddingBottom: 12 }}>
                  {c.days === 1 ? "day" : "days"}
                </div>
              </div>
              <div style={{ display: "flex", fontSize: 27, fontWeight: 600, marginTop: 10, color: TOURNEY.inkSoft }}>
                {c.weekday} · {c.time} PT
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                background: TOURNEY.panel,
                border: `1px solid ${TOURNEY.accent}`,
                borderRadius: 26,
                padding: "24px 38px",
                color: TOURNEY.ink,
                fontSize: 36,
                fontWeight: 800,
                letterSpacing: 1,
              }}
            >
              Registration open · skycave.space/tournament
            </div>
          )}
        </div>
      </div>
    ),
    { width: 1200, height: 1200 }
  );
}
