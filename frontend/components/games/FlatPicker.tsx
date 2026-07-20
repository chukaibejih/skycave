"use client";
import { useRef } from "react";
import { EARTH_TEXTURE, type Marker } from "./geo";

interface Props {
  markers: Marker[];
  onPick?: (lat: number, lng: number) => void;
  interactive?: boolean;
}

/**
 * Flat fallback for GeoGuess when WebGL is unavailable.
 *
 * The globe's texture is equirectangular, so the same image doubles as a plain
 * world map with an exact linear mapping between pixels and coordinates. That
 * keeps the round playable (and scored identically, since the server only ever
 * sees a lat/lng) instead of dropping the player on an error screen.
 *
 * The map is pinned to a 2:1 box and stretched to fill it, which is what makes
 * the mapping below exact rather than approximate.
 */
export function FlatPicker({ markers, onPick, interactive = true }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);

  const handle = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive || !onPick) return;
    const el = mapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x = Math.min(Math.max(e.clientX - r.left, 0), r.width);
    const y = Math.min(Math.max(e.clientY - r.top, 0), r.height);
    onPick(90 - (y / r.height) * 180, (x / r.width) * 360 - 180);
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div
        ref={mapRef}
        onClick={handle}
        className="relative w-full"
        style={{
          aspectRatio: "2 / 1",
          maxHeight: "100%",
          backgroundImage: `url(${EARTH_TEXTURE})`,
          backgroundSize: "100% 100%",
          backgroundRepeat: "no-repeat",
          cursor: interactive && onPick ? "crosshair" : "default",
        }}
      >
        {markers.map((m, i) => (
          <span
            key={i}
            title={m.label}
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
            style={{
              left: `${((m.lng + 180) / 360) * 100}%`,
              top: `${((90 - m.lat) / 180) * 100}%`,
              background: m.color,
              borderColor: "rgba(5,6,10,0.85)",
              boxShadow: `0 0 10px ${m.color}`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
