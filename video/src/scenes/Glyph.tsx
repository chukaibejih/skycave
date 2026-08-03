import React from "react";

// The eight tournament glyphs, ported verbatim from the app's
// components/games/gameVisual.tsx GameGlyph so a game looks like itself in the
// film too. `color` arrives already resolved to hex.
export const GameGlyph: React.FC<{ type: string; color: string }> = ({
  type,
  color,
}) => {
  const common = { fill: "none", stroke: color, strokeWidth: 2 } as const;
  switch (type) {
    case "color_clash":
      return (
        <svg width="34" height="34" viewBox="0 0 24 24" {...common}>
          <circle cx="9" cy="9" r="5" />
          <circle cx="15" cy="15" r="5" />
        </svg>
      );
    case "word_hunt":
      return (
        <svg width="34" height="34" viewBox="0 0 24 24" {...common} strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2.5" />
          <path d="M8 9l3 3 2-2 3 4" fill="none" />
        </svg>
      );
    case "dots_boxes":
      return (
        <svg width="34" height="34" viewBox="0 0 24 24" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round">
          <path d="M7 7h10M7 7v10" />
          {[7, 17].map((x) => [7, 17].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill={color} stroke="none" />))}
        </svg>
      );
    case "connect4":
      return (
        <svg width="34" height="34" viewBox="0 0 24 24" stroke={color} strokeWidth={1.8} fill="none">
          <rect x="4" y="4" width="16" height="16" rx="2.5" />
          <circle cx="9" cy="15" r="1.9" fill={color} />
          <circle cx="15" cy="15" r="1.9" fill={color} fillOpacity="0.35" />
          <circle cx="9" cy="9.5" r="1.9" fill={color} fillOpacity="0.35" />
        </svg>
      );
    case "tile_takeover":
      return (
        <svg width="34" height="34" viewBox="0 0 24 24" stroke={color} strokeWidth={1.8} fill="none">
          <rect x="4" y="4" width="7" height="7" rx="1.4" fill={color} fillOpacity="0.4" />
          <rect x="13" y="4" width="7" height="7" rx="1.4" />
          <rect x="4" y="13" width="7" height="7" rx="1.4" />
          <rect x="13" y="13" width="7" height="7" rx="1.4" fill={color} fillOpacity="0.4" />
        </svg>
      );
    case "uno":
      return (
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
          <g transform="rotate(-16 12 20)">
            <rect x="4.5" y="5" width="9.5" height="14" rx="2" fill="#ff5a4e" />
            <rect x="4.5" y="5" width="9.5" height="14" rx="2" stroke="#05060a" strokeWidth="1.1" />
          </g>
          <g transform="rotate(14 12 20)">
            <rect x="10.5" y="5" width="9.5" height="14" rx="2" fill="#4a90ff" />
            <rect x="10.5" y="5" width="9.5" height="14" rx="2" stroke="#05060a" strokeWidth="1.1" />
            <path d="M13.2 9.4h4.2" stroke="#f5f7ff" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M13.2 12h4.2" stroke="#ffd166" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M13.2 14.6h4.2" stroke="#3fce7c" strokeWidth="1.5" strokeLinecap="round" />
          </g>
        </svg>
      );
    case "clay":
      return (
        <svg width="34" height="34" viewBox="0 0 24 24" stroke={color} strokeWidth={1.8} fill="none" strokeLinejoin="round">
          <path d="M9 4h6" />
          <path d="M9 4c0 2-2 3-2 6s2 4 2 5c-3 1-4 2-4 3.5 0 0 3 1.5 7 1.5s7-1.5 7-1.5c0-1.5-1-2.5-4-3.5 0-1 2-2 2-5s-2-4-2-6" fill={color} fillOpacity="0.22" />
        </svg>
      );
    case "mancala":
      return (
        <svg width="34" height="34" viewBox="0 0 24 24" stroke={color} strokeWidth={1.6} fill="none">
          <rect x="2.5" y="6" width="13" height="12" rx="3" />
          <rect x="17" y="4.5" width="4.5" height="15" rx="2.2" fill={color} fillOpacity="0.25" />
          {[6, 10, 13].map((cx) => (
            <g key={cx}>
              <circle cx={cx} cy="10" r="1.5" fill={color} stroke="none" />
              <circle cx={cx} cy="14" r="1.5" fill={color} stroke="none" />
            </g>
          ))}
        </svg>
      );
    default:
      return (
        <svg width="34" height="34" viewBox="0 0 24 24" {...common}>
          <rect x="4" y="4" width="16" height="16" rx="3" />
        </svg>
      );
  }
};
