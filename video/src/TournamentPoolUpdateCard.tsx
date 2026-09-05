import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { display, mono } from "./fonts";

// A single share card for a tournament-pool substitution. This stays in the
// evergreen Skycave tournament voice instead of inheriting the weekly skin, so
// it reads clearly even when people see it weeks later in their feed.
const BASE = "#05060a";
const INK = "#f5f7ff";
const MUTED = "#9ca5c0";
const BORDER = "#283044";
const OFF = "#ff4d75";
const ON = "#4ff0b0";

export const TournamentPoolUpdateCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const pad = width * 0.08;
  const title = spring({ frame: frame - 4, fps, config: { damping: 17, stiffness: 130 } });
  const first = spring({ frame: frame - 14, fps, config: { damping: 17, stiffness: 125 } });
  const second = spring({ frame: frame - 23, fps, config: { damping: 17, stiffness: 125 } });
  const footer = interpolate(frame, [34, 52], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const row = (label: string, game: string, code: string, color: string, scale: number, arrow: "up" | "down") => (
    <div
      style={{
        opacity: scale,
        transform: `translateY(${interpolate(scale, [0, 1], [32, 0])}px)`,
        position: "relative",
        overflow: "hidden",
        border: `1px solid ${BORDER}`,
        background: "#10131c",
        borderRadius: width * 0.03,
        minHeight: height * 0.175,
        padding: `${width * 0.04}px ${width * 0.055}px ${width * 0.04}px ${width * 0.2}px`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div style={{ position: "absolute", inset: 0, width: width * 0.016, background: color, display: "flex" }} />
      <div style={{ position: "absolute", left: width * 0.06, top: "50%", width: width * 0.09, height: width * 0.09, borderRadius: "50%", border: `3px solid ${color}`, transform: "translateY(-50%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 0, height: 0, borderLeft: `${width * 0.018}px solid transparent`, borderRight: `${width * 0.018}px solid transparent`, ...(arrow === "up" ? { borderBottom: `${width * 0.026}px solid ${color}` } : { borderTop: `${width * 0.026}px solid ${color}` }), display: "flex" }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: width * 0.03 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontFamily: mono, fontSize: width * 0.024, letterSpacing: "0.19em", color, textTransform: "uppercase" }}>{label}</span>
          <span style={{ marginTop: width * 0.014, fontFamily: display, fontSize: width * 0.073, fontWeight: 500, lineHeight: 1, color: INK }}>{game}</span>
        </div>
        <span style={{ border: `2px solid ${color}`, borderRadius: width * 0.018, padding: `${width * 0.012}px ${width * 0.018}px`, fontFamily: mono, fontSize: width * 0.029, letterSpacing: "0.12em", color, display: "flex" }}>{code}</span>
      </div>
    </div>
  );

  return (
    <AbsoluteFill style={{ background: BASE, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, padding: pad, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: width * 0.018 }}>
          <div style={{ width: width * 0.014, height: width * 0.014, borderRadius: "50%", background: ON, display: "flex" }} />
          <span style={{ fontFamily: mono, fontSize: width * 0.024, letterSpacing: "0.2em", color: MUTED, textTransform: "uppercase" }}>Weekend Tournament · Roster Change</span>
        </div>
        <div style={{ marginTop: height * 0.055, opacity: title, transform: `translateY(${interpolate(title, [0, 1], [24, 0])}px)`, fontFamily: display, fontSize: width * 0.13, fontWeight: 500, lineHeight: 0.95, letterSpacing: -3, color: INK }}>
          Substitution
        </div>
        <div style={{ marginTop: height * 0.11, display: "flex", flexDirection: "column", gap: width * 0.025 }}>
          {row("Coming off", "Dots and Boxes", "D&B", OFF, first, "down")}
          {row("Coming on", "Color Clash", "CLR", ON, second, "up")}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ opacity: footer, paddingBottom: width * 0.008, display: "flex" }}>
          <span style={{ fontFamily: display, fontSize: width * 0.034, color: MUTED }}>skycave.space/tournament</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
