import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Background, SceneFade } from "../shared";
import { C } from "../theme";
import { display } from "../fonts";

// A representative funnel, not a literal 64-slot draw: sixteen leaves collapsing
// round by round to a single gold final. The picture says "knockout"; the label
// carries the real scale. Geometry is derived from the live canvas size, so the
// same scene lays out for both the vertical and the wide cut.
const COUNTS = [16, 8, 4, 2, 1];

type Pt = { x: number; y: number };

function buildColumns(w: number, h: number): Pt[][] {
  const x0 = w * 0.089;
  const x1 = w * 0.911;
  const top = h * 0.323;
  const bottom = h * 0.813;
  const xs = COUNTS.map((_, i) => x0 + (i * (x1 - x0)) / (COUNTS.length - 1));
  const leaves: Pt[] = Array.from({ length: COUNTS[0] }, (_, i) => ({
    x: xs[0],
    y: top + (i * (bottom - top)) / (COUNTS[0] - 1),
  }));
  const cols: Pt[][] = [leaves];
  for (let c = 1; c < COUNTS.length; c++) {
    const prev = cols[c - 1];
    const cur: Pt[] = [];
    for (let j = 0; j < COUNTS[c]; j++) {
      const a = prev[2 * j];
      const b = prev[2 * j + 1];
      cur.push({ x: xs[c], y: (a.y + b.y) / 2 });
    }
    cols.push(cur);
  }
  return cols;
}

/**
 * Scene 4 (18 to 24s). The bracket draws itself left to right, each round's
 * connectors appearing in turn, until everything converges on one node that
 * pulses gold, the champion's seat. "64 players. One champion." sits above it.
 */
export const Bracket: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const cols = buildColumns(width, height);
  const wide = width > height;

  const heading = spring({ frame: frame - 6, fps, config: { damping: 200 } });

  // Draw windows: one connector set between each pair of columns, staggered.
  const draw = (set: number) =>
    interpolate(frame, [14 + set * 17, 14 + set * 17 + 22], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  // The final node's arrival and endless pulse.
  const finalIn = spring({
    frame: frame - (14 + (cols.length - 1) * 17),
    fps,
    config: { damping: 12, stiffness: 140 },
  });
  const pulse = interpolate(Math.sin(frame / 7), [-1, 1], [0.55, 1]);
  const pulseR = interpolate(Math.sin(frame / 7), [-1, 1], [26, 34]);
  const final = cols[cols.length - 1][0];

  return (
    <SceneFade durationInFrames={durationInFrames} inF={9} outF={10}>
      <Background violet={0.1} warm={0.42} />

      {/* Heading */}
      <AbsoluteFill style={{ alignItems: "center", paddingTop: height * 0.11 }}>
        <div
          style={{
            opacity: heading,
            transform: `translateY(${interpolate(heading, [0, 1], [24, 0])}px)`,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontFamily: display,
              fontWeight: 700,
              fontSize: wide ? 66 : 78,
              color: C.ink,
              letterSpacing: "-0.01em",
            }}
          >
            64 players.
          </div>
          <div
            style={{
              fontFamily: display,
              fontWeight: 700,
              fontSize: wide ? 66 : 78,
              color: C.gold,
              letterSpacing: "-0.01em",
              textShadow: `0 0 40px ${C.gold}66`,
            }}
          >
            One champion.
          </div>
        </div>
      </AbsoluteFill>

      <AbsoluteFill>
        <svg width={width} height={height} style={{ position: "absolute" }}>
          <defs>
            <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>

          {/* connectors, column by column */}
          {cols.slice(1).map((col, ci) => {
            const p = draw(ci);
            if (p <= 0) return null;
            const prev = cols[ci];
            return col.map((parent, j) => {
              const children = [prev[2 * j], prev[2 * j + 1]];
              return children.map((child, k) => (
                <line
                  key={`${ci}-${j}-${k}`}
                  x1={child.x}
                  y1={child.y}
                  x2={parent.x}
                  y2={parent.y}
                  stroke={C.warm}
                  strokeWidth={3}
                  strokeLinecap="round"
                  opacity={0.85}
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={1 - p}
                  style={{ filter: "drop-shadow(0 0 6px " + C.warm + "aa)" }}
                />
              ));
            });
          })}

          {/* leaf + intermediate nodes */}
          {cols.slice(0, -1).map((col, ci) =>
            col.map((n, j) => {
              const appear = interpolate(
                frame,
                [8 + ci * 17, 18 + ci * 17],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              );
              const r = ci === 0 ? 7 : 9 + ci * 2;
              return (
                <circle
                  key={`n-${ci}-${j}`}
                  cx={n.x}
                  cy={n.y}
                  r={r}
                  fill={C.warmSoft}
                  opacity={appear * 0.9}
                  style={{ filter: "drop-shadow(0 0 8px " + C.warm + "cc)" }}
                />
              );
            })
          )}

          {/* the final: gold, pulsing */}
          <circle
            cx={final.x}
            cy={final.y}
            r={pulseR + 22}
            fill={C.gold}
            opacity={finalIn * pulse * 0.22}
            style={{ filter: "url(#soft)" }}
          />
          <circle
            cx={final.x}
            cy={final.y}
            r={finalIn * pulseR}
            fill={C.gold}
            style={{ filter: `drop-shadow(0 0 22px ${C.gold})` }}
          />
        </svg>
      </AbsoluteFill>
    </SceneFade>
  );
};
