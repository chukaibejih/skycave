import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SceneFade } from "../../shared";
import { C } from "../../theme";
import { display, mono } from "../../fonts";
import { Caption, CupBg, GateGlyph, SeatPill } from "./parts";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Beat 3 (7.5 to 12.5s). The hero. The empty byes give way to a gold PLAY-IN
 * gate: the last to register face a qualifier, and its winner lights up a real
 * main-draw seat. */
export const Gate: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const wide = width >= height;
  const pillW = wide ? 360 : 440;

  const gate = spring({ frame: frame - 6, fps, config: { damping: 14, stiffness: 120 } });
  const pill1 = spring({ frame: frame - 24, fps, config: { damping: 200 } });
  const pill2 = spring({ frame: frame - 32, fps, config: { damping: 200 } });

  // Phase B: a play-in winner steps into a main-draw seat.
  const reveal = interpolate(frame, [88, 100], [0, 1], clamp);
  const seatFill = spring({ frame: frame - 104, fps, config: { damping: 12, stiffness: 140, mass: 0.8 } });
  const filled = seatFill > 0.35;

  const cap1 = interpolate(frame, [40, 56], [0, 1], clamp) * (1 - interpolate(frame, [84, 96], [0, 1], clamp));
  const cap2 = interpolate(frame, [98, 116], [0, 1], clamp);

  return (
    <SceneFade durationInFrames={durationInFrames} inF={8} outF={8}>
      <CupBg warm={0.42} violet={0.12} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: wide ? 24 : 34 }}>
        {/* Gate header */}
        <div
          style={{
            opacity: gate,
            transform: `translateY(${interpolate(gate, [0, 1], [30, 0])}px)`,
            display: "flex",
            alignItems: "center",
            gap: 14,
            filter: `drop-shadow(0 0 18px ${C.gold}55)`,
          }}
        >
          <GateGlyph size={52} color={C.gold} stroke={2.4} />
          <span style={{ fontFamily: mono, fontSize: 40, letterSpacing: "0.2em", textTransform: "uppercase", color: C.gold }}>
            Play-in
          </span>
        </div>

        {/* The two play-in matches */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ opacity: pill1, transform: `translateX(${interpolate(pill1, [0, 1], [-26, 0])}px)` }}>
            <SeatPill tone="gold" label="player   vs   player" width={pillW} />
          </div>
          <div style={{ opacity: pill2, transform: `translateX(${interpolate(pill2, [0, 1], [26, 0])}px)` }}>
            <SeatPill tone="gold" label="player   vs   player" width={pillW} />
          </div>
        </div>

        {/* Winner -> a main-draw seat lights up */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, opacity: reveal }}>
          <span style={{ fontFamily: display, fontSize: 44, color: C.gold }}>&darr;</span>
        </div>
        <div style={{ opacity: reveal, transform: `scale(${interpolate(seatFill, [0, 1], [0.96, 1])})` }}>
          <SeatPill
            tone={filled ? "gold" : "seat"}
            label={filled ? "you're in" : "main-draw seat"}
            tag={filled ? "✓" : undefined}
            width={pillW}
            dashed={!filled}
          />
        </div>

        {/* Captions, crossfading at the bottom */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: wide ? 56 : 210 }}>
          <div style={{ position: "absolute", left: 0, right: 0, opacity: cap1 }}>
            <Caption title="Now the last to register face a play-in." size={wide ? 54 : 60} />
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, opacity: cap2 }}>
            <Caption
              title={
                <>
                  Win it, and you&rsquo;re <span style={{ color: C.gold }}>in the main draw.</span>
                </>
              }
              size={wide ? 54 : 60}
            />
          </div>
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};
