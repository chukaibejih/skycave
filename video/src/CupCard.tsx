import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { display, mono } from "./fonts";

/**
 * The weekend-tournament announcement card, as a still. The same ocean/beach
 * scene as the hub card (TournamentBanner / TOURNEY): a bright sky with a low
 * sun, a sea with drifting foam, a shore of sand. The countdown block carries
 * the registration deadline so the post says "get in before it closes".
 *
 * Rendered via `remotion still`. Landscape 16:9 by default.
 *
 * The DAYS number is a snapshot for a post going out early in the week; change
 * CLOSE.days / CLOSE.when here and re-render if the timing differs.
 */
const OCEAN = {
  sky: "linear-gradient(180deg, #8ad9ee 0%, #cdeef0 60%, #eaf6ec 100%)",
  sea: "linear-gradient(180deg, #4bd0cb 0%, #12a0bd 100%)",
  sand: "linear-gradient(180deg, #ffe7ba 0%, #f2d18c 100%)",
  sunCore: "#fff6d8",
  sun: "#ffce6a",
  ink: "#04303f",
  inkSoft: "#0a6072",
  pool: "linear-gradient(180deg, #0e7a91 0%, #063a49 100%)",
  aqua: "#8ff2ea",
  accent: "#0fb5c9",
};

const CLOSE = { days: "3", when: "Thursday · 12 PM PT" };

export const CupCard: React.FC = () => {
  const { width, height } = useVideoConfig();
  const pad = Math.round(width * 0.06);
  const seaH = Math.round(height * 0.3);

  return (
    <AbsoluteFill style={{ background: OCEAN.sky, fontFamily: display, overflow: "hidden" }}>
      {/* Sun, low over the water */}
      <div
        style={{
          position: "absolute",
          top: height * 0.06,
          right: width * 0.08,
          width: width * 0.14,
          height: width * 0.14,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${OCEAN.sunCore} 0%, ${OCEAN.sun} 52%, rgba(255,206,106,0) 74%)`,
        }}
      />
      {/* soft second glow low-left */}
      <div
        style={{
          position: "absolute",
          left: -width * 0.05,
          top: height * 0.2,
          width: width * 0.28,
          height: width * 0.28,
          borderRadius: "50%",
          background: OCEAN.sun,
          opacity: 0.16,
          filter: "blur(120px)",
        }}
      />

      {/* Sea + sand */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: seaH, background: OCEAN.sea }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: Math.round(height * 0.05), background: OCEAN.sand }} />
      {/* Foam at the waterline */}
      <svg
        width={width}
        height={40}
        viewBox="0 0 1600 40"
        preserveAspectRatio="none"
        style={{ position: "absolute", left: 0, bottom: seaH - 14 }}
      >
        <path d="M-40 22 C 200 8, 440 34, 720 20 S 1240 8, 1660 22" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="4" />
        <path d="M-40 32 C 260 20, 520 40, 820 28 S 1320 16, 1660 30" fill="none" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="4" />
      </svg>

      {/* Content */}
      <div style={{ position: "absolute", inset: 0, padding: pad, display: "flex", flexDirection: "column" }}>
        <div style={{ fontFamily: mono, fontSize: width * 0.019, letterSpacing: "0.24em", textTransform: "uppercase", color: OCEAN.inkSoft }}>
          Weekend event
        </div>

        <div
          style={{
            marginTop: 14,
            fontWeight: 700,
            fontSize: width * 0.072,
            lineHeight: 1.0,
            letterSpacing: -2,
            color: OCEAN.ink,
            textShadow: "0 1px 0 rgba(255,255,255,0.4)",
          }}
        >
          Skycave Weekend
          <br />
          Tournament
        </div>

        <div style={{ marginTop: 18, fontWeight: 500, fontSize: width * 0.026, color: OCEAN.inkSoft }}>
          Free to enter · 1v1 weekend bracket · Crowned Monday
        </div>

        <div style={{ flex: 1 }} />

        {/* Countdown pool + CTA, on one row over the sea */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: pad }}>
          <div
            style={{
              position: "relative",
              overflow: "hidden",
              borderRadius: 22,
              background: OCEAN.pool,
              border: "1px solid rgba(255,255,255,0.2)",
              padding: `${width * 0.02}px ${width * 0.03}px`,
              display: "flex",
              alignItems: "center",
              gap: width * 0.028,
            }}
          >
            <svg width="240" height="16" viewBox="0 0 240 16" preserveAspectRatio="none" style={{ position: "absolute", top: 0, left: 0, width: "100%" }}>
              <path d="M-10 9 C 40 3, 90 14, 140 8 S 250 3, 260 9" fill="none" stroke="#fff" strokeOpacity="0.4" strokeWidth="2" />
            </svg>
            <div>
              <div style={{ fontFamily: mono, fontSize: width * 0.016, letterSpacing: "0.2em", textTransform: "uppercase", color: OCEAN.aqua }}>
                Registration closes in
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 6 }}>
                <span style={{ fontWeight: 700, fontSize: width * 0.075, lineHeight: 0.9, color: "#ffffff" }}>{CLOSE.days}</span>
                <span style={{ fontWeight: 700, fontSize: width * 0.03, color: "#ffffff" }}>days</span>
              </div>
              <div style={{ marginTop: 8, fontSize: width * 0.018, color: OCEAN.aqua }}>{CLOSE.when}</div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              borderRadius: 16,
              background: OCEAN.sun,
              color: OCEAN.ink,
              fontWeight: 700,
              fontSize: width * 0.026,
              padding: `${width * 0.017}px ${width * 0.032}px`,
              boxShadow: "0 10px 26px rgba(4,48,63,0.35)",
              whiteSpace: "nowrap",
            }}
          >
            Claim your spot →
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
