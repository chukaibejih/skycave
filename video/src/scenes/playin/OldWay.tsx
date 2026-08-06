import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SceneFade } from "../../shared";
import { C } from "../../theme";
import { display, mono } from "../../fonts";
import { CupBg, SeatPill } from "./parts";

// A 9-field padded up to a bracket of 16: 7 lone players get a bye, one pair
// actually plays. The wall of grey BYEs is the point.
const ROWS: { tone: "bye" | "live"; label: string; tag?: string }[] = [
  { tone: "bye", label: "player", tag: "bye" },
  { tone: "bye", label: "player", tag: "bye" },
  { tone: "bye", label: "player", tag: "bye" },
  { tone: "live", label: "player  vs  player" },
  { tone: "bye", label: "player", tag: "bye" },
  { tone: "bye", label: "player", tag: "bye" },
  { tone: "bye", label: "player", tag: "bye" },
  { tone: "bye", label: "player", tag: "bye" },
];

/** Beat 2 (3.5 to 7.5s). The old way. A first round that is almost all byes:
 * seven free passes, one real match. Flat and grey on purpose. */
export const OldWay: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const wide = width >= height;
  const pillW = wide ? 380 : 460;
  const scale = wide ? 0.82 : 1;

  const cap = interpolate(frame, [40, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <SceneFade durationInFrames={durationInFrames} inF={8} outF={8}>
      <CupBg warm={0.34} violet={0.1} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: wide ? 40 : 60 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{ fontFamily: mono, fontSize: 24, letterSpacing: "0.2em", textTransform: "uppercase", color: C.ink2, marginBottom: 8 }}>
            9 in the draw
          </div>
          {ROWS.map((r, i) => {
            const s = spring({ frame: frame - 4 - i * 2, fps, config: { damping: 200 } });
            return (
              <div key={i} style={{ opacity: s, transform: `translateX(${interpolate(s, [0, 1], [-24, 0])}px)` }}>
                <SeatPill tone={r.tone} label={r.label} tag={r.tag} width={pillW} scale={scale} />
              </div>
            );
          })}
        </div>

        <div style={{ opacity: cap, transform: `translateY(${interpolate(cap, [0, 1], [14, 0])}px)`, textAlign: "center" }}>
          <div style={{ fontFamily: display, fontWeight: 700, fontSize: wide ? 60 : 66, color: C.ink }}>
            9 players used to mean{" "}
            <span style={{ color: C.warmSoft }}>7 free passes.</span>
          </div>
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};
