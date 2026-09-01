import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C } from "./theme";
import { SceneFade } from "./shared";
import { display, mono } from "./fonts";

// A five-card tournament rules announcement, in the STABLE Skycave brand (never
// the weekly tournament skin, which rotates): near-black ground, the app's
// display/mono type, gold as the constant tournament accent, a faint evergreen
// bracket behind. Each card is a real Remotion composition (subtle motion +, on
// card 01, the move clock ticking down) so it renders as a loop or a still.

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const GOLD = C.gold;
const CORAL = "#ff725e";

// ── shared furniture ───────────────────────────────────────────────────────

/** A faint knockout bracket, drawn in once, sitting behind the type. Evergreen
 * (not the weekly skin) - just the shape of a tournament. */
const BracketMotif: React.FC<{ w: number; h: number }> = ({ w, h }) => {
  const frame = useCurrentFrame();
  const draw = interpolate(frame, [6, 40], [0, 1], clamp);
  const stroke = `${C.ink2}22`;
  const x0 = w * 0.6;
  const col = w * 0.12;
  const rows = [h * 0.26, h * 0.42, h * 0.58, h * 0.74];
  const mids = [(rows[0] + rows[1]) / 2, (rows[2] + rows[3]) / 2];
  const final = (mids[0] + mids[1]) / 2;
  const seg = (x1: number, y1: number, x2: number, y2: number, key: string) => {
    const len = Math.abs(x2 - x1) + Math.abs(y2 - y1);
    return (
      <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={3}
        strokeDasharray={len} strokeDashoffset={len * (1 - draw)} />
    );
  };
  return (
    <svg width={w} height={h} style={{ position: "absolute", inset: 0 }} aria-hidden>
      {/* round 1: four seats into two */}
      {rows.map((y, i) => seg(x0, y, x0 + col, y, `r${i}`))}
      {seg(x0 + col, rows[0], x0 + col, rows[1], "v0")}
      {seg(x0 + col, rows[2], x0 + col, rows[3], "v1")}
      {mids.map((y, i) => seg(x0 + col, y, x0 + col * 2, y, `m${i}`))}
      {/* semis into the final */}
      {seg(x0 + col * 2, mids[0], x0 + col * 2, mids[1], "vf")}
      {seg(x0 + col * 2, final, x0 + col * 3, final, "f")}
      {/* the cup node */}
      <circle cx={x0 + col * 3} cy={final} r={12} fill="none" stroke={`${GOLD}55`} strokeWidth={3}
        strokeDasharray={80} strokeDashoffset={80 * (1 - draw)} />
    </svg>
  );
};

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { width, height } = useVideoConfig();
  const pad = Math.round(width * 0.075);
  return (
    <AbsoluteFill style={{ background: C.base }}>
      <AbsoluteFill style={{ background: `radial-gradient(58% 40% at 15% 0%, ${GOLD}14, transparent 70%)` }} />
      <BracketMotif w={width} h={height} />
      <AbsoluteFill style={{ background: "radial-gradient(120% 90% at 50% 50%, transparent 58%, rgba(0,0,0,0.5) 100%)" }} />
      {/* wordmark + rail */}
      <div style={{ position: "absolute", top: pad, left: pad, right: pad, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: display, fontWeight: 700, fontSize: width * 0.036, color: C.ink }}>
          sky<span style={{ color: C.violet }}>cave</span>
        </span>
        <span style={{ fontFamily: mono, fontSize: width * 0.019, letterSpacing: "0.22em", textTransform: "uppercase", color: GOLD }}>
          Tournament Rules
        </span>
      </div>
      <div style={{ position: "absolute", inset: 0, padding: pad, paddingTop: pad * 2.4, display: "flex", flexDirection: "column" }}>
        {children}
      </div>
      {/* footer */}
      <div style={{ position: "absolute", bottom: pad, left: pad, right: pad, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: mono, fontSize: width * 0.018, letterSpacing: "0.14em", color: C.ink2 }}>skycave.space</span>
        <span style={{ fontFamily: mono, fontSize: width * 0.018, letterSpacing: "0.14em", color: C.ink2 }}>Weekend Tournament</span>
      </div>
    </AbsoluteFill>
  );
};

// ── the move clock (card 01) ───────────────────────────────────────────────

/** The 120s move clock, ticked down as a timelapse across the card: a depleting
 * gold ring + mm:ss, going coral in the final stretch, then a FORFEIT stamp. */
const MoveClock: React.FC<{ size: number }> = ({ size }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const start = 26;
  const runFor = durationInFrames - start - 30; // leave a beat on 0:00
  const p = interpolate(frame, [start, start + runFor], [0, 1], clamp); // 0..1 elapsed
  const secsLeft = Math.max(0, Math.round(120 * (1 - p)));
  const urgent = secsLeft <= 12;
  const done = secsLeft === 0;
  const color = done ? CORAL : urgent ? CORAL : GOLD;
  const r = size / 2 - 10;
  const circ = 2 * Math.PI * r;
  const pop = spring({ frame: frame - 8, fps, config: { damping: 13, stiffness: 130 } });
  const mm = Math.floor(secsLeft / 60);
  const ss = (secsLeft % 60).toString().padStart(2, "0");

  return (
    <div style={{ position: "relative", width: size, height: size, transform: `scale(${interpolate(pop, [0, 1], [0.8, 1])})`, opacity: pop }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`${C.ink2}22`} strokeWidth={10} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * p}
          style={{ filter: `drop-shadow(0 0 ${urgent ? 16 : 8}px ${color}88)`, opacity: urgent ? 0.6 + 0.4 * Math.abs(Math.sin(frame / 4)) : 1 }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
        <div style={{ fontFamily: mono, fontSize: size * 0.06, letterSpacing: "0.18em", textTransform: "uppercase", color: C.ink2 }}>
          {done ? "" : "Your move"}
        </div>
        <div style={{ fontFamily: display, fontWeight: 700, fontSize: size * (done ? 0.16 : 0.26), color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {done ? "FORFEIT" : `${mm}:${ss}`}
        </div>
      </div>
    </div>
  );
};

// ── card 01: intro ─────────────────────────────────────────────────────────

export const RulesIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, durationInFrames } = useVideoConfig();
  const title = spring({ frame: frame - 8, fps, config: { damping: 18, stiffness: 120 } });
  const lines = [
    ["Less", " waiting."],
    ["Fewer matches decided by", " technicalities."],
    ["More games decided by", " actually playing."],
  ];
  return (
    <SceneFade durationInFrames={durationInFrames} inF={8} outF={8}>
      <Shell>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontFamily: mono, fontSize: width * 0.026, letterSpacing: "0.2em", textTransform: "uppercase", color: GOLD, opacity: title }}>
            Rules Update
          </div>
          <div style={{ marginTop: 14, fontFamily: display, fontWeight: 700, fontSize: width * 0.115, lineHeight: 0.98, letterSpacing: -3, color: C.ink, opacity: title, transform: `translateY(${interpolate(title, [0, 1], [22, 0])}px)` }}>
            Three rules
            <br />
            are changing.
          </div>
          <div style={{ marginTop: width * 0.06, display: "flex", flexDirection: "column", gap: 14 }}>
            {lines.map(([a, b], i) => {
              const o = interpolate(frame, [24 + i * 8, 36 + i * 8], [0, 1], clamp);
              return (
                <div key={i} style={{ opacity: o, transform: `translateX(${interpolate(o, [0, 1], [-14, 0])}px)`, display: "flex", alignItems: "baseline", gap: width * 0.02 }}>
                  <div style={{ width: width * 0.03, height: 3, background: GOLD, alignSelf: "center" }} />
                  <span style={{ fontFamily: display, fontWeight: 500, fontSize: width * 0.036, color: C.ink2 }}>
                    {a}<span style={{ color: C.ink, fontWeight: 700 }}>{b}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Shell>
    </SceneFade>
  );
};

// ── cards 02-05: a numbered rule ───────────────────────────────────────────

const RuleCard: React.FC<{
  n: string;
  headline: string[];
  body: React.ReactNode;
  clock?: boolean;
}> = ({ n, headline, body, clock }) => {
  const frame = useCurrentFrame();
  const { fps, width, durationInFrames } = useVideoConfig();
  const num = spring({ frame: frame - 4, fps, config: { damping: 15, stiffness: 120 } });
  const head = spring({ frame: frame - 12, fps, config: { damping: 18, stiffness: 120 } });
  const bodyO = interpolate(frame, [26, 40], [0, 1], clamp);
  return (
    <SceneFade durationInFrames={durationInFrames} inF={8} outF={8}>
      <Shell>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: width * 0.03 }}>
            <div style={{ fontFamily: display, fontWeight: 700, fontSize: width * 0.2, lineHeight: 0.8, color: GOLD, letterSpacing: -4, opacity: num, transform: `translateY(${interpolate(num, [0, 1], [18, 0])}px)`, textShadow: `0 0 40px ${GOLD}33` }}>
              {n}
            </div>
            {clock && (
              <div style={{ marginLeft: "auto" }}>
                <MoveClock size={width * 0.26} />
              </div>
            )}
          </div>
          <div style={{ marginTop: width * 0.03, fontFamily: display, fontWeight: 700, fontSize: width * 0.086, lineHeight: 0.98, letterSpacing: -2, color: C.ink, opacity: head, transform: `translateY(${interpolate(head, [0, 1], [18, 0])}px)` }}>
            {headline.map((l, i) => (
              <React.Fragment key={i}>{l}{i < headline.length - 1 && <br />}</React.Fragment>
            ))}
          </div>
          <div style={{ marginTop: width * 0.04, maxWidth: width * 0.84, fontFamily: display, fontWeight: 500, fontSize: width * 0.032, lineHeight: 1.35, color: C.ink2, opacity: bodyO }}>
            {body}
          </div>
        </div>
      </Shell>
    </SceneFade>
  );
};

const em = (s: string) => <span style={{ color: C.ink, fontWeight: 700 }}>{s}</span>;

export const Rule01: React.FC = () => (
  <RuleCard
    n="01"
    headline={["Keep", "playing."]}
    clock
    body={<>Once a game starts, {em("stay active")}. If it's your turn and the clock runs out, you {em("forfeit the game")}. Drop out? You get a short window to return.</>}
  />
);
export const Rule02: React.FC = () => (
  <RuleCard
    n="02"
    headline={["Show up", "to play."]}
    body={<>Checking in says you're coming, {em("not")} that you'll advance. If you're ready and your opponent never shows, {em("you take the win")}.</>}
  />
);
export const Rule03: React.FC = () => (
  <RuleCard
    n="03"
    headline={["Check-in order", "decides nothing."]}
    body={<>Clicking "check in" first is {em("no advantage")}. Matches are decided by games played and legitimate forfeits, never by who was fastest to a button.</>}
  />
);
export const Rule04: React.FC = () => (
  <RuleCard
    n="04"
    headline={["No show,", "no advance."]}
    body={<>If neither player shows before the deadline, {em("neither advances")}. The next-round opponent gets a walkover. In the final, {em("the title is vacated")}.</>}
  />
);
