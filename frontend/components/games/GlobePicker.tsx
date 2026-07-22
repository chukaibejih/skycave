"use client";
import dynamic from "next/dynamic";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FlatPicker } from "./FlatPicker";
import { EARTH_TEXTURE, type Marker } from "./geo";

// Re-exported so existing call sites keep importing these from here.
export { EARTH_TEXTURE, type Marker };

// react-globe.gl touches `window`/WebGL on import - load it client-only.
const Globe = dynamic(() => import("react-globe.gl"), { ssr: false, loading: () => null });

interface Props {
  markers: Marker[];
  onPick?: (lat: number, lng: number) => void;
  interactive?: boolean;
}


// Camera distance - lower = the globe fills more of the frame (default is 2.5,
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

/**
 * Can this browser actually give us a live WebGL context right now?
 *
 * iOS Safari caps how many contexts may exist at once and silently hands back a
 * lost one past the limit. three.js then calls getShaderPrecisionFormat() on it,
 * gets null, and throws while reading `.precision` - which is exactly the crash
 * seen in production. Probing for that same null up front lets us fall back to
 * the flat map instead of dying inside the renderer.
 *
 * The probe releases its own context immediately, or it would consume one of
 * the very slots it is testing for.
 */
function webglUsable(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") ??
      c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    const ok = !!gl.getShaderPrecisionFormat?.(gl.VERTEX_SHADER, gl.HIGH_FLOAT);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Catches a throw from inside the globe (a context lost mid-render, a driver
 * quirk) and swaps in the flat map, so one bad WebGL call can't take out the
 * whole route via the app-level error boundary.
 */
class GlobeBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function GlobePicker({ markers, onPick, interactive = true }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globeRef = useRef<any>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  // null = not probed yet; probing must happen after mount (no WebGL on the server).
  const [usable, setUsable] = useState<boolean | null>(null);

  useEffect(() => setUsable(webglUsable()), []);

  /**
   * Hand the WebGL context back on unmount.
   *
   * three.js does not release one when the component goes away, so every globe
   * mount used to leak a context. Over a long session (48 solo games in 90
   * minutes, in the report that prompted this) the browser hits its ceiling and
   * every later globe fails to initialise until a full reload.
   */
  useEffect(() => {
    return () => {
      const g = globeRef.current;
      if (!g) return;
      try {
        g.pauseAnimation?.();
        const r = g.renderer?.();
        r?.dispose?.();
        r?.forceContextLoss?.();
      } catch {
        /* teardown must never throw */
      }
    };
  }, []);

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

  const flat = (
    <FlatPicker markers={markers} onPick={onPick} interactive={interactive} />
  );

  if (usable === false) return flat;

  return (
    <div ref={wrapRef} className="absolute inset-0">
      {usable && dims.w > 0 && dims.h > 0 && (
        <GlobeBoundary fallback={flat}>
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
        </GlobeBoundary>
      )}
    </div>
  );
}
