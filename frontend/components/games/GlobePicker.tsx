"use client";
import dynamic from "next/dynamic";
import { useLayoutEffect, useRef, useState } from "react";

// react-globe.gl touches `window`/WebGL on import — load it client-only.
const Globe = dynamic(() => import("react-globe.gl"), { ssr: false, loading: () => null });

export interface Marker {
  lat: number;
  lng: number;
  color: string;
  label?: string;
  size?: number;
}

interface Props {
  markers: Marker[];
  onPick?: (lat: number, lng: number) => void;
  interactive?: boolean;
}

export const EARTH_TEXTURE = "/textures/earth-blue-marble.jpg";

// Camera distance — lower = the globe fills more of the frame (default is 2.5,
// which leaves a small globe floating in space).
const POV_ALTITUDE = 1.85;

// Warm the heavy globe chunk + texture *before* the timed round begins. Called
// from the lobby so the globe is ready the instant round 1 starts, instead of
// downloading ~2MB while the clock is running.
let _preloaded = false;
export function preloadGlobe(): void {
  if (_preloaded || typeof window === "undefined") return;
  _preloaded = true;
  void import("react-globe.gl");
  const img = new window.Image();
  img.src = EARTH_TEXTURE;
}

export function GlobePicker({ markers, onPick, interactive = true }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globeRef = useRef<any>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  // Measure the *absolute* fill box (which has a real pixel size, unlike a
  // percentage-height child). Gate rendering on a real size so the globe is
  // never created at the wrong dimensions.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) {
        setDims((d) =>
          d.w === Math.round(r.width) && d.h === Math.round(r.height)
            ? d
            : { w: Math.round(r.width), h: Math.round(r.height) }
        );
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const applyPov = () => {
    const g = globeRef.current;
    if (!g) return;
    g.pointOfView({ lat: 15, lng: 10, altitude: POV_ALTITUDE });
    const controls = g.controls?.();
    if (controls) {
      controls.autoRotate = interactive;
      controls.autoRotateSpeed = 0.32;
      controls.enableZoom = true;
      controls.minDistance = 180;
    }
  };

  return (
    <div ref={wrapRef} className="absolute inset-0">
      {dims.w > 0 && dims.h > 0 && (
        <Globe
          ref={globeRef}
          width={dims.w}
          height={dims.h}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl={EARTH_TEXTURE}
          showAtmosphere
          atmosphereColor="#8b7cff"
          atmosphereAltitude={0.18}
          onGlobeReady={applyPov}
          pointsData={markers}
          pointLat={(d: object) => (d as Marker).lat}
          pointLng={(d: object) => (d as Marker).lng}
          pointColor={(d: object) => (d as Marker).color}
          pointAltitude={(d: object) => (d as Marker).size ?? 0.06}
          pointRadius={0.65}
          pointLabel={(d: object) => (d as Marker).label ?? ""}
          onGlobeClick={
            interactive && onPick
              ? ({ lat, lng }: { lat: number; lng: number }) => onPick(lat, lng)
              : undefined
          }
        />
      )}
    </div>
  );
}
