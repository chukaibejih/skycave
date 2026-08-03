"use client";
import { useEffect, useRef, useState } from "react";
import { EARTH_TEXTURE, type Marker } from "./geo";

interface Props {
  markers: Marker[];
  onPick?: (lat: number, lng: number) => void;
  interactive?: boolean;
  textureUrl?: string;
}

/**
 * Flat fallback for GeoGuess when WebGL is unavailable.
 *
 * This version includes full pan and pinch-to-zoom capabilities.
 */
export function FlatPicker({ markers, onPick, interactive = true, textureUrl = EARTH_TEXTURE }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  const [transform, setTransform] = useState({ x: 0, y: 0, s: 1 });
  const tRef = useRef({ x: 0, y: 0, s: 1 });

  // Pan and zoom event handlers
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !interactive) return;

    let s = tRef.current.s;
    let tx = tRef.current.x;
    let ty = tRef.current.y;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialPinchDist = 0;
    let initialPinchScale = 1;
    let pinchCenter = { x: 0, y: 0 };

    const updateTransform = () => {
      tRef.current = { x: tx, y: ty, s };
      setTransform(tRef.current);
    };

    const clampScaleAndPan = () => {
      s = Math.max(1, Math.min(s, 15));
      const boundX = (el.clientWidth / 2) * s;
      const boundY = (el.clientHeight / 2) * s;
      tx = Math.max(-boundX, Math.min(tx, boundX));
      ty = Math.max(-boundY, Math.min(ty, boundY));
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = -e.deltaY * 0.002;
      const newS = Math.max(1, Math.min(15, s * Math.exp(zoomFactor)));
      
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - el.clientWidth / 2;
      const mouseY = e.clientY - rect.top - el.clientHeight / 2;
      const scaleRatio = newS / s;
      
      tx = mouseX - (mouseX - tx) * scaleRatio;
      ty = mouseY - (mouseY - ty) * scaleRatio;
      s = newS;
      
      clampScaleAndPan();
      updateTransform();
    };

    const getPinchDist = (touches: TouchList) => {
      return Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY
      );
    };

    const getPinchCenter = (touches: TouchList, rect: DOMRect) => {
      return {
        x: (touches[0].clientX + touches[1].clientX) / 2 - rect.left,
        y: (touches[0].clientY + touches[1].clientY) / 2 - rect.top
      };
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const rect = el.getBoundingClientRect();
        initialPinchDist = getPinchDist(e.touches);
        initialPinchScale = s;
        pinchCenter = getPinchCenter(e.touches, rect);
        startX = pinchCenter.x - tx;
        startY = pinchCenter.y - ty;
      } else if (e.touches.length === 1) {
        isDragging = true;
        startX = e.touches[0].clientX - tx;
        startY = e.touches[0].clientY - ty;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault(); // Prevents pull-to-refresh
      if (e.touches.length === 2) {
        const rect = el.getBoundingClientRect();
        const dist = getPinchDist(e.touches);
        const center = getPinchCenter(e.touches, rect);
        
        const newS = initialPinchScale * (dist / initialPinchDist);
        const scaleRatio = newS / s;
        
        const centerX = center.x - el.clientWidth / 2;
        const centerY = center.y - el.clientHeight / 2;
        
        s = newS;
        tx = centerX - (centerX - tx) * scaleRatio;
        ty = centerY - (centerY - ty) * scaleRatio;
        
        clampScaleAndPan();
        updateTransform();
      } else if (e.touches.length === 1 && isDragging) {
        tx = e.touches[0].clientX - startX;
        ty = e.touches[0].clientY - startY;
        clampScaleAndPan();
        updateTransform();
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      isDragging = true;
      startX = e.clientX - tx;
      startY = e.clientY - ty;
      el.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" || !isDragging) return;
      tx = e.clientX - startX;
      ty = e.clientY - startY;
      clampScaleAndPan();
      updateTransform();
    };

    const onPointerUp = (e: PointerEvent) => {
      isDragging = false;
      if (e.pointerType !== "touch") {
        el.releasePointerCapture(e.pointerId);
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onPointerUp);
    el.addEventListener("touchcancel", onPointerUp);
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onPointerUp);
      el.removeEventListener("touchcancel", onPointerUp);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
    };
  }, [interactive]);

  // Click handling logic that ignores drags
  const clickStart = useRef<{x: number, y: number, time: number} | null>(null);

  const handlePointerDownMap = (e: React.PointerEvent) => {
    clickStart.current = { x: e.clientX, y: e.clientY, time: Date.now() };
  };

  const handlePointerUpMap = (e: React.PointerEvent) => {
    if (!clickStart.current || !interactive || !onPick) return;
    const dx = e.clientX - clickStart.current.x;
    const dy = e.clientY - clickStart.current.y;
    // Fire click only if it was a quick tap with minimal movement
    if (Math.hypot(dx, dy) < 10 && Date.now() - clickStart.current.time < 500) {
      const el = mapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const x = Math.min(Math.max(e.clientX - r.left, 0), r.width);
      const y = Math.min(Math.max(e.clientY - r.top, 0), r.height);
      onPick(90 - (y / r.height) * 180, (x / r.width) * 360 - 180);
    }
  };

  return (
    <div 
      ref={containerRef} 
      className="absolute inset-0 flex items-center justify-center overflow-hidden touch-none"
    >
      <div
        ref={mapRef}
        onPointerDown={handlePointerDownMap}
        onPointerUp={handlePointerUpMap}
        className="relative w-full"
        style={{
          aspectRatio: "2 / 1",
          maxHeight: "100%",
          backgroundImage: `url(${textureUrl})`,
          backgroundSize: "100% 100%",
          backgroundRepeat: "no-repeat",
          cursor: interactive && onPick ? "crosshair" : "default",
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.s})`,
          transformOrigin: "center center",
          willChange: "transform",
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
              // Keep marker scale visually constant by inverse scaling
              transform: `translate(-50%, -50%) scale(${1 / transform.s})`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
