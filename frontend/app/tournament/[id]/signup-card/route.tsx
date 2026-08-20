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
 * weekly skin swap re-themes this card with zero changes here: swap the palette,
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

  // Perspective grid: verticals fan from a vanishing point at the horizon, a few
  // horizontals bunch as they recede. Drawn once as SVG so it stays crisp.
  const GRID_TOP = 760; // where the grid (and horizon) sit
  const grid = (
    <svg
      width="1200"
      height={1200 - GRID_TOP}
      viewBox={`0 0 1200 ${1200 - GRID_TOP}`}
      style={{ position: "absolute", left: 0, top: GRID_TOP, display: "flex" }}
    >
      {[-900, -520, -260, -90, 90, 260, 520, 900, 1400, -400, 1600].map((x, i) => (
        <line key={i} x1="600" y1="0" x2={x + 600} y2={440} stroke={TOURNEY.grid} strokeOpacity="0.45" strokeWidth="2" />
      ))}
      {[10, 48, 104, 190, 320, 440].map((y, i) => (
        <line key={`h${i}`} x1="0" y1={y} x2="1200" y2={y} stroke={TOURNEY.grid} strokeOpacity="0.4" strokeWidth="2" />
      ))}
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
        {/* star specks */}
        {[[140, 120], [1050, 90], [880, 220], [300, 260], [1120, 320], [60, 360], [520, 90], [980, 430]].map(
          ([x, y], i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: x,
                top: y,
                width: i % 3 === 0 ? 6 : 4,
                height: i % 3 === 0 ? 6 : 4,
                borderRadius: 6,
                background: "#ffffff",
                opacity: 0.8,
                display: "flex",
              }}
            />
          )
        )}

        {/* the banded retro sun, sitting on the horizon and clear of the copy */}
        <div
          style={{
            position: "absolute",
            left: 545,
            top: 540,
            width: 360,
            height: 360,
            borderRadius: 360,
            background: `radial-gradient(circle, ${TOURNEY.sunCore} 0%, ${TOURNEY.sunTop} 44%, ${TOURNEY.sun} 72%, rgba(255,47,135,0) 82%)`,
            display: "flex",
          }}
        />
        {[700, 720, 738, 753].map((y, i) => (
          <div
            key={`band${i}`}
            style={{
              position: "absolute",
              left: 580,
              top: y,
              width: 290,
              height: 9 - i,
              background: TOURNEY.sky,
              opacity: 0.92,
              display: "flex",
            }}
          />
        ))}

        {/* the glowing horizon line */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: GRID_TOP - 3,
            height: 6,
            background: TOURNEY.horizon,
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: GRID_TOP - 60,
            height: 60,
            background: `linear-gradient(180deg, rgba(255,79,216,0) 0%, rgba(255,79,216,0.28) 100%)`,
            display: "flex",
          }}
        />
        {grid}

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
