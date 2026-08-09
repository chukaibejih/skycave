import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SceneFade } from "../../shared";
import { CupBg } from "../playin/parts";
import { display, mono } from "../../fonts";
import { APP, BracketMatchCard, CupNode } from "./parts";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Beat 1. The real entry point: the tournament bracket at a live fixture, with
 * the LIVE card, the best-of-three games, the coral WATCH button (which taps),
 * and the trophy the final feeds into. No explanation - it's the app. */
export const Bracket: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const wide = width >= height;
  const cardW = wide ? 500 : 600;

  const enter = spring({ frame: frame - 6, fps, config: { damping: 16, stiffness: 120 } });
  const tapAt = durationInFrames - 34;
  const watchTap = interpolate(frame, [tapAt, tapAt + 6, tapAt + 16], [0, 1, 0], clamp);
  const ripple = interpolate(frame, [tapAt, tapAt + 22], [0, 1], clamp);
  const rippleShow = frame >= tapAt && frame < tapAt + 22;

  return (
    <SceneFade durationInFrames={durationInFrames} inF={8} outF={6}>
      <CupBg warm={0.34} violet={0.16} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: wide ? 26 : 40, padding: 40 }}>
        {/* Header, as on the tournament page */}
        <div style={{ textAlign: "center", opacity: interpolate(frame, [0, 14], [0, 1], clamp) }}>
          <div style={{ fontFamily: display, fontWeight: 700, fontSize: wide ? 50 : 62, color: APP.ink }}>Tournament</div>
          <div style={{ fontFamily: display, fontSize: wide ? 24 : 28, color: APP.ink2, marginTop: 6 }}>
            8 in the draw · 3 rounds to a champion
          </div>
        </div>

        {/* "Play is live." banner */}
        <div
          style={{
            opacity: interpolate(frame, [8, 20], [0, 1], clamp),
            width: cardW + (wide ? 190 : 150),
            maxWidth: "86%",
            padding: "16px 22px",
            borderRadius: 14,
            border: `1px solid ${APP.border}`,
            background: `${APP.surface}99`,
            color: APP.green,
            fontFamily: display,
            fontWeight: 700,
            fontSize: wide ? 24 : 28,
          }}
        >
          Play is live.
        </div>

        {/* FINAL card -> connector -> CUP, the bracket's business end */}
        <div style={{ display: "flex", alignItems: "center", gap: wide ? 26 : 18, opacity: enter, transform: `translateY(${interpolate(enter, [0, 1], [26, 0])}px)` }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontFamily: mono, fontSize: 17, letterSpacing: "0.16em", color: APP.warm }}>FINAL · CLOSES IN 15H</div>
            <div style={{ position: "relative" }}>
              <BracketMatchCard
                width={cardW}
                a={{ name: "Nova ✨", ring: true }}
                b={{ name: "Caver" }}
                lines={[
                  { name: "Connect 4", tag: "now" },
                  { name: "Tile Takeover", tag: "-" },
                  { name: "Mancala", tag: "-" },
                ]}
                watchTap={watchTap}
              />
              {rippleShow && (
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    bottom: 40,
                    width: 46,
                    height: 46,
                    marginLeft: -23,
                    borderRadius: "50%",
                    border: `2px solid ${APP.warm}`,
                    transform: `scale(${1 + ripple * 4})`,
                    opacity: 1 - ripple,
                  }}
                />
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ width: wide ? 38 : 22, height: 2, background: APP.cyan, boxShadow: `0 0 7px ${APP.cyan}` }} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div style={{ fontFamily: mono, fontSize: 15, letterSpacing: "0.16em", color: APP.ink2 }}>CUP</div>
              <CupNode lit={false} />
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};
