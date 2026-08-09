import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { CupBg } from "./scenes/playin/parts";
import { display, mono } from "./fonts";
import { APP, BracketMatchCard, EyeIcon } from "./scenes/spectate/parts";

/**
 * The cover/thumbnail for the spectating film. Built from the same app UI as the
 * video (the LIVE bracket card + WATCH), so the cover and the film are the same
 * product. Responsive: a landscape lockup (16:9) and a stacked one (9:16).
 * Rendered as a still via `remotion still`.
 */
export const SpectateThumb: React.FC = () => {
  const { width, height } = useVideoConfig();
  const wide = width >= height;

  const Eyebrow = (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <EyeIcon size={34} color={APP.cyan} stroke={2.2} />
      <span style={{ fontFamily: mono, fontSize: 30, letterSpacing: "0.22em", textTransform: "uppercase", color: APP.warm }}>
        Spectating · New
      </span>
    </div>
  );

  const Headline = (
    <div style={{ fontFamily: display, fontWeight: 700, letterSpacing: -2, lineHeight: 0.98, color: APP.ink, fontSize: wide ? 150 : 138 }}>
      Watch it
      <br />
      <span style={{ color: APP.warm }}>live.</span>
    </div>
  );

  const Sub = (
    <div style={{ fontFamily: display, fontWeight: 500, fontSize: wide ? 40 : 42, color: APP.ink2, maxWidth: 620 }}>
      Drop into any live game · react in real time.
    </div>
  );

  // The hero card with a few reactions flying and the watcher count.
  const Card = (
    <div style={{ position: "relative", transform: `rotate(-3deg)`, filter: "drop-shadow(0 30px 60px rgba(0,0,0,0.6))" }}>
      <BracketMatchCard
        width={wide ? 560 : 640}
        a={{ name: "Nova ✨", ring: true }}
        b={{ name: "Caver" }}
        lines={[
          { name: "Connect 4", tag: "now" },
          { name: "Tile Takeover", tag: "-" },
        ]}
      />
      {/* Reactions bursting off the card */}
      <div style={{ position: "absolute", top: -70, left: -46, fontSize: 96, transform: "rotate(-12deg)" }}>🔥</div>
      <div style={{ position: "absolute", top: -30, right: -70, fontSize: 84, transform: "rotate(10deg)" }}>😮</div>
      <div style={{ position: "absolute", top: 150, right: -104, fontSize: 92, transform: "rotate(8deg)" }}>🎉</div>
      <div style={{ position: "absolute", bottom: 20, left: -34, fontSize: 80, transform: "rotate(-8deg)" }}>👏</div>
      {/* Watcher count pill, sitting just under the card so WATCH stays clear */}
      <div
        style={{
          position: "absolute",
          bottom: -78,
          right: 20,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 22px",
          borderRadius: 999,
          background: `${APP.cyan}18`,
          border: `1.5px solid ${APP.cyan}66`,
          transform: "rotate(3deg)",
        }}
      >
        <EyeIcon size={30} color={APP.cyan} />
        <span style={{ fontFamily: mono, fontSize: 36, color: APP.ink }}>128 watching</span>
      </div>
    </div>
  );

  return (
    <AbsoluteFill>
      <CupBg warm={0.42} violet={0.18} />
      {wide ? (
        <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: "0 110px", gap: 60 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
            {Eyebrow}
            {Headline}
            {Sub}
          </div>
          <div style={{ flex: "none" }}>{Card}</div>
        </AbsoluteFill>
      ) : (
        <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 90, padding: 80 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 26, textAlign: "center" }}>
            {Eyebrow}
            <div style={{ fontFamily: display, fontWeight: 700, letterSpacing: -2, lineHeight: 0.98, color: APP.ink, fontSize: 150 }}>
              Watch it <span style={{ color: APP.warm }}>live.</span>
            </div>
            <div style={{ fontFamily: display, fontWeight: 500, fontSize: 42, color: APP.ink2 }}>
              Drop in · react in real time.
            </div>
          </div>
          <div style={{ flex: "none", marginTop: 30 }}>{Card}</div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
