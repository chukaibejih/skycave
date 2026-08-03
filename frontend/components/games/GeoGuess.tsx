"use client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { GlobePicker, EARTH_TEXTURE, EARTH_DAY_TEXTURE, type Marker } from "./GlobePicker";
import type { RoundResult } from "@/lib/store";
import type { PlayerSlot } from "@/lib/types";

interface RoundData {
  prompt: string;
  round_time: number;
}

interface Guess {
  lat: number;
  lng: number;
  distance_km: number;
  points: number;
}

interface Props {
  roundData: RoundData;
  phase: string;
  result: RoundResult | null;
  onAction: (data: Record<string, unknown>) => void;
  submitted?: boolean; // from store - survives reconnect
  players?: PlayerSlot[];
  meId?: string;
  solo?: boolean;
}

const P_COLOR = ["#6C63FF", "#FF6B6B"];

export function GeoGuess({
  roundData,
  phase,
  result,
  onAction,
  submitted: submittedFromServer,
  players = [],
  meId,
  solo,
}: Props) {
  const active = phase === "active";
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [submittedLocal, setSubmittedLocal] = useState(false);

  // Map view preferences (saved to localStorage, defaulting to Satellite & 3D)
  const [mapType, setMapType] = useState<"satellite" | "terrain">(() => {
    if (typeof window === "undefined") return "satellite";
    return (localStorage.getItem("geoguess_map_type") as "satellite" | "terrain") || "satellite";
  });
  const [viewMode, setViewMode] = useState<"3d" | "2d">(() => {
    if (typeof window === "undefined") return "3d";
    return (localStorage.getItem("geoguess_view_mode") as "3d" | "2d") || "3d";
  });

  const toggleMapType = (t: "satellite" | "terrain") => {
    setMapType(t);
    try {
      localStorage.setItem("geoguess_map_type", t);
    } catch {}
  };

  const toggleViewMode = (v: "3d" | "2d") => {
    setViewMode(v);
    try {
      localStorage.setItem("geoguess_view_mode", v);
    } catch {}
  };

  useEffect(() => {
    setPin(null);
    setSubmittedLocal(false);
  }, [roundData.prompt]);

  const submitted = submittedLocal || !!submittedFromServer;

  const answer = result?.answer as
    | { lat?: number; lng?: number; name?: string; guesses?: Record<string, Guess> }
    | undefined;
  const guesses = answer?.guesses ?? {};

  const colorFor = (pid: string) => {
    const idx = players.findIndex((p) => p.id === pid);
    return P_COLOR[idx] ?? "#9aa3ba";
  };

  const markers = useMemo<Marker[]>(() => {
    const m: Marker[] = [];
    if (active && pin) {
      m.push({ ...pin, color: "#6C63FF", label: "your guess", size: 0.09 });
    }
    if (!active) {
      if (answer?.lat != null && answer?.lng != null) {
        m.push({ lat: answer.lat, lng: answer.lng, color: "#4FFFB0", label: answer.name ?? "target", size: 0.16 });
      }
      for (const [pid, g] of Object.entries(guesses)) {
        const who = players.find((p) => p.id === pid);
        m.push({
          lat: g.lat,
          lng: g.lng,
          color: colorFor(pid),
          label: `${who?.id === meId ? "you" : who?.display_name ?? "player"} · ${g.distance_km.toLocaleString()} km`,
          size: 0.11,
        });
      }
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, active, answer, players, meId]);

  const lockIn = () => {
    if (pin && !submitted) {
      onAction({ lat: pin.lat, lng: pin.lng });
      setSubmittedLocal(true);
    }
  };

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* Full-bleed globe behind the UI */}
      <GlobePicker
        markers={markers}
        interactive={active && !submitted}
        textureUrl={mapType === "satellite" ? EARTH_TEXTURE : EARTH_DAY_TEXTURE}
        forceFlat={viewMode === "2d"}
        onPick={(lat, lng) => active && !submitted && setPin({ lat, lng })}
      />

      {/* Top-left floating map tools (Google Earth style) */}
      <div className="absolute left-4 top-4 z-20 flex flex-col gap-3">
        {/* Map Type Toggle */}
        <button
          type="button"
          onClick={() => toggleMapType(mapType === "satellite" ? "terrain" : "satellite")}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:bg-black/60 active:scale-95"
          title={mapType === "satellite" ? "Switch to Terrain" : "Switch to Satellite"}
        >
          {mapType === "satellite" ? (
            // Terrain Icon (Mountain) shown when in Satellite, to imply "Click for Terrain"
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
            </svg>
          ) : (
            // Satellite Icon (Globe) shown when in Terrain, to imply "Click for Satellite"
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          )}
        </button>

        {/* View Mode Toggle */}
        <button
          type="button"
          onClick={() => toggleViewMode(viewMode === "3d" ? "2d" : "3d")}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:bg-black/60 active:scale-95 font-[var(--font-mono)] text-[13px] font-bold"
          title={viewMode === "3d" ? "Switch to 2D" : "Switch to 3D"}
        >
          {viewMode === "3d" ? "2D" : "3D"}
        </button>
      </div>

      {/* Top gradient for prompt legibility */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-36 bg-[linear-gradient(180deg,var(--color-base),transparent)]" />
      {/* Bottom gradient for the action area */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-48 bg-[linear-gradient(0deg,var(--color-base),transparent)]" />

      {/* Floating prompt - taps pass through to the globe */}
      <div className="pointer-events-none relative z-10 px-4 pt-3 text-center">
        <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-secondary)]">
          find
        </div>
        <div className="mt-0.5 font-[var(--font-display)] text-2xl font-bold text-[var(--color-text-primary)] drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
          {roundData.prompt}
        </div>
      </div>

      {/* Spacer keeps the action pinned to the bottom; globe shows through */}
      <div className="flex-1" />

      {/* Floating action area */}
      <div className="pointer-events-none relative z-10 px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <div className="pointer-events-auto mx-auto w-full max-w-md">
          {active ? (
            submitted ? (
              <p className="rounded-[var(--radius-card)] bg-[var(--color-surface)]/80 py-3 text-center text-sm text-[var(--color-text-secondary)] backdrop-blur-md">
                {solo ? "locked in · scoring…" : "locked in · waiting for opponent…"}
              </p>
            ) : (
              <Button full onClick={lockIn} disabled={!pin}>
                {pin ? "Lock in guess" : "Tap the globe to drop a pin"}
              </Button>
            )
          ) : (
            <ResultPanel answer={answer} guesses={guesses} players={players} meId={meId} colorFor={colorFor} solo={solo} />
          )}
        </div>
      </div>
    </div>
  );
}

function ResultPanel({
  answer,
  guesses,
  players,
  meId,
  colorFor,
  solo,
}: {
  answer?: { name?: string };
  guesses: Record<string, Guess>;
  players: PlayerSlot[];
  meId?: string;
  colorFor: (pid: string) => string;
  solo?: boolean;
}) {
  const rows = players
    .map((p) => ({ player: p, guess: guesses[p.id] }))
    .filter((r) => r.guess);
  // No per-round "winner" in solo - there's no one to beat.
  const best = solo ? Infinity : Math.max(0, ...rows.map((r) => r.guess!.points));

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]/90 p-3 backdrop-blur-md">
      <div className="mb-2 text-center font-[var(--font-display)] text-lg font-bold text-[var(--color-success)]">
        {answer?.name}
      </div>
      <div className="space-y-1.5">
        {rows.map(({ player, guess }) => {
          const won = guess!.points === best && best > 0;
          return (
            <div key={player.id} className="flex items-center justify-between">
              <span className="flex items-center gap-2 truncate text-sm text-[var(--color-text-primary)]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorFor(player.id) }} />
                {player.id === meId ? "you" : player.display_name}
                {won && <span className="text-[var(--color-success)]">★</span>}
              </span>
              <span className="flex items-baseline gap-3 font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
                <span>{guess!.distance_km.toLocaleString()} km</span>
                <span className="font-[var(--font-display)] text-base font-bold text-[var(--color-text-primary)]">
                  +{guess!.points}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
