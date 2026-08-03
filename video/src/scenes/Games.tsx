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
import { body, display } from "../fonts";
import { GAMES } from "../games";
import { GameGlyph } from "./Glyph";

/**
 * The games screen. The whole tournament pool, drawn with the same card the app
 * uses on the tournament page (accent stripe down the left, glyph in a tinted
 * tile, name, one-line tagline), so a player sees exactly what they will get.
 */
export const Games: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const wide = width > height;

  const head = spring({ frame: frame - 4, fps, config: { damping: 200 } });

  return (
    <SceneFade durationInFrames={durationInFrames} inF={9} outF={10}>
      <Background violet={0.1} warm={0.4} />
      <Embers count={16} tint={C.warmSoft} />

      <AbsoluteFill
        style={{ padding: wide ? "0 80px" : "0 56px", justifyContent: "center" }}
      >
        <div
          style={{
            opacity: head,
            transform: `translateY(${interpolate(head, [0, 1], [22, 0])}px)`,
          }}
        >
          <div
            style={{
              fontFamily: display,
              fontWeight: 700,
              fontSize: 66,
              color: C.ink,
              letterSpacing: "-0.01em",
            }}
          >
            The games in the pot
          </div>
          <div
            style={{
              marginTop: 12,
              fontFamily: body,
              fontWeight: 500,
              fontSize: 32,
              color: C.ink2,
            }}
          >
            Your fixture draws three of these.
          </div>
        </div>

        <div
          style={{
            marginTop: wide ? 44 : 56,
            display: "grid",
            gridTemplateColumns: wide ? "repeat(4, 1fr)" : "1fr 1fr",
            gap: 22,
          }}
        >
          {GAMES.map((g, i) => {
            const enter = spring({
              frame: frame - (18 + i * 5),
              fps,
              config: { damping: 16, stiffness: 120, mass: 0.7 },
            });
            return (
              <div
                key={g.slug}
                style={{
                  opacity: enter,
                  transform: `translateY(${interpolate(enter, [0, 1], [34, 0])}px)`,
                  position: "relative",
                  overflow: "hidden",
                  borderRadius: 24,
                  border: `1px solid ${C.border}`,
                  background: C.surface,
                  padding: "28px 26px 26px 32px",
                  minHeight: 208,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* the game's own colour down the left edge */}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 6,
                    background: g.accent,
                  }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                  <div
                    style={{
                      width: 74,
                      height: 74,
                      borderRadius: 18,
                      background: `${g.accent}1f`,
                      border: `1px solid ${g.accent}55`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ transform: "scale(1.6)" }}>
                      <GameGlyph type={g.slug} color={g.accent} />
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: display,
                      fontWeight: 700,
                      fontSize: 34,
                      lineHeight: 1.05,
                      color: C.ink,
                    }}
                  >
                    {g.name}
                  </div>
                </div>
                <div
                  style={{
                    marginTop: 20,
                    fontFamily: body,
                    fontWeight: 400,
                    fontSize: 25,
                    lineHeight: 1.32,
                    color: C.ink2,
                  }}
                >
                  {g.tagline}
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};
