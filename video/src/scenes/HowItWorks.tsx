import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Background, Embers, SceneFade } from "../shared";
import { C } from "../theme";
import { body } from "../fonts";

// The rulebook's own voice, three beats. Matches app/tournament/rules.
const LINES = ["One weekend.", "Straight knockout.", "Best of three."];

/**
 * Scene 3 (10 to 18s). Three lines land one at a time, each a fast upward
 * entrance, timed like someone saying them out loud. No icons, no bullets. Just
 * the words.
 */
export const HowItWorks: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const wide = width > height;

  // Two big soft orbs drifting behind the words, positioned as fractions of the
  // canvas so they land right in either the tall or the wide cut.
  const orbA = {
    x: width * 0.17 + Math.sin(frame / 55) * 60,
    y: height * 0.27 + Math.cos(frame / 70) * 40,
  };
  const orbB = {
    x: width * 0.78 + Math.cos(frame / 48) * 70,
    y: height * 0.71 + Math.sin(frame / 60) * 50,
  };

  return (
    <SceneFade durationInFrames={durationInFrames} inF={8} outF={10}>
      <Background violet={0.12} warm={0.5} />
      <AbsoluteFill>
        <div
          style={{
            position: "absolute",
            left: orbA.x,
            top: orbA.y,
            width: 520,
            height: 520,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${C.warm}22, transparent 68%)`,
            filter: "blur(20px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: orbB.x,
            top: orbB.y,
            width: 460,
            height: 460,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${C.amber}1c, transparent 68%)`,
            filter: "blur(20px)",
          }}
        />
      </AbsoluteFill>
      <Embers count={26} tint={C.warmSoft} />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: wide ? "center" : "flex-start",
          textAlign: wide ? "center" : "left",
          paddingLeft: wide ? 0 : 130,
          gap: 34,
        }}
      >
        {LINES.map((line, i) => {
          const delay = 14 + i * 26; // ~0.85s apart, deliberate
          const enter = spring({
            frame: frame - delay,
            fps,
            config: { damping: 14, stiffness: 120, mass: 0.7 },
          });
          const y = interpolate(enter, [0, 1], [46, 0]);
          return (
            <div
              key={line}
              style={{
                opacity: enter,
                transform: `translateY(${y}px)`,
                fontFamily: body,
                fontWeight: 500,
                fontSize: 92,
                letterSpacing: "-0.01em",
                color: C.ink,
                textShadow: "0 6px 30px rgba(0,0,0,0.45)",
              }}
            >
              {line}
            </div>
          );
        })}
      </AbsoluteFill>
    </SceneFade>
  );
};
