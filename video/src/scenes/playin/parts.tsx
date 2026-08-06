import React from "react";
import { AbsoluteFill } from "remotion";
import { Background } from "../../shared";
import { C } from "../../theme";
import { display, mono } from "../../fonts";

/** The tournament world's warm space: amber from the floor, a trace of violet. */
export const CupBg: React.FC<{ warm?: number; violet?: number }> = ({ warm = 0.5, violet = 0.12 }) => (
  <Background warm={warm} violet={violet} />
);

/** The door / "step in" glyph the app uses for the play-in. */
export const GateGlyph: React.FC<{ size?: number; color?: string; stroke?: number }> = ({
  size = 80,
  color = C.gold,
  stroke = 2,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <path d="M10 17l5-5-5-5" />
    <path d="M15 12H3" />
  </svg>
);

/** A caption block: a mono kicker over a display headline, plus optional sub. */
export const Caption: React.FC<{
  kicker?: string;
  title: React.ReactNode;
  sub?: string;
  color?: string;
  opacity?: number;
  y?: number;
  size?: number;
}> = ({ kicker, title, sub, color = C.ink, opacity = 1, y = 0, size = 74 }) => (
  <div style={{ opacity, transform: `translateY(${y}px)`, textAlign: "center", padding: "0 40px" }}>
    {kicker && (
      <div
        style={{
          fontFamily: mono,
          fontSize: 26,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: C.gold,
        }}
      >
        {kicker}
      </div>
    )}
    <div
      style={{
        marginTop: kicker ? 12 : 0,
        fontFamily: display,
        fontWeight: 700,
        fontSize: size,
        color,
        lineHeight: 1.05,
        textShadow: "0 2px 22px rgba(0,0,0,0.85)",
      }}
    >
      {title}
    </div>
    {sub && (
      <div style={{ marginTop: 12, fontFamily: display, fontWeight: 500, fontSize: 38, color: C.ink2 }}>
        {sub}
      </div>
    )}
  </div>
);

type Tone = "bye" | "live" | "gold" | "seat";

const TONES: Record<Tone, { bg: string; border: string; fg: string; dot: number }> = {
  bye: { bg: "rgba(255,255,255,0.035)", border: "rgba(255,255,255,0.1)", fg: C.ink2, dot: 0.5 },
  live: { bg: `${C.warm}1f`, border: `${C.warm}66`, fg: C.warmSoft, dot: 1 },
  gold: { bg: `${C.gold}1c`, border: `${C.gold}88`, fg: C.gold, dot: 1 },
  seat: { bg: "rgba(255,255,255,0.03)", border: `${C.gold}55`, fg: C.gold, dot: 1 },
};

/** A bracket seat pill: a dot + a label, toned by role. `tag` is a small
 * right-aligned marker like BYE or a check. */
export const SeatPill: React.FC<{
  tone: Tone;
  label: string;
  tag?: string;
  width?: number;
  opacity?: number;
  scale?: number;
  dashed?: boolean;
}> = ({ tone, label, tag, width = 420, opacity = 1, scale = 1, dashed }) => {
  const t = TONES[tone];
  return (
    <div
      style={{
        width,
        opacity,
        transform: `scale(${scale})`,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "16px 20px",
        borderRadius: 15,
        background: t.bg,
        border: `1.5px ${dashed ? "dashed" : "solid"} ${t.border}`,
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: t.fg,
          flex: "none",
          opacity: t.dot,
        }}
      />
      <span
        style={{
          flex: 1,
          fontFamily: display,
          fontWeight: 600,
          fontSize: 32,
          color: t.fg,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </span>
      {tag && (
        <span
          style={{
            fontFamily: mono,
            fontSize: 20,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: t.fg,
            opacity: 0.85,
          }}
        >
          {tag}
        </span>
      )}
    </div>
  );
};

export const CenterFill: React.FC<{ children: React.ReactNode; gap?: number }> = ({ children, gap = 0 }) => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap }}>{children}</AbsoluteFill>
);
