"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ConnectionBadge } from "@/components/ui/ConnectionBadge";
import { AuthModal } from "@/components/ui/AuthModal";
import { Button } from "@/components/ui/Button";
import { GameShell } from "@/components/games/GameShell";
import { preloadGlobe } from "@/components/games/GlobePicker";
import { ApiError, createRoom } from "@/lib/api";
import { reportClientError } from "@/lib/report";
import { gameTypeFromSlug } from "@/lib/solo";
import { useAuth, useRoom } from "@/lib/store";

// Single-player. Unlike /room/[id] there's no lobby or portal — we create a solo
// room, connect, auto-ready, and drop straight into the game.
export default function PlayPage() {
  const { game: slug } = useParams<{ game: string }>();
  const gameType = gameTypeFromSlug(slug);
  const router = useRouter();
  const { identity, loaded, hydrate } = useAuth();
  const { room, status, game, gameEnd, connect, disconnect, sendReady } = useRoom();

  const [roomId, setRoomId] = useState<string | null>(null);
  const [gameName, setGameName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dailyDone, setDailyDone] = useState<string | null>(null);
  const startedRef = useRef(false);
  const readiedRef = useRef(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (gameType === "geoguess") preloadGlobe();
  }, [gameType]);

  // Create the solo room + connect, exactly once.
  useEffect(() => {
    if (!loaded || !identity || startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const mode =
          new URLSearchParams(window.location.search).get("mode") === "daily" ? "daily" : "solo";
        const r = await createRoom(gameType, mode);
        setRoomId(r.id);
        setGameName(r.game_name ?? null);
        connect(r.id);
      } catch (e) {
        startedRef.current = false;
        if (e instanceof ApiError && e.status === 409) {
          setDailyDone(e.message || "You already played today's pot.");
        } else {
          // Say what actually failed. "Couldn't start that game" with no detail
          // is a dead end for the player and undiagnosable for us — a stale tab
          // pointing at a dead origin looks identical to the server refusing.
          const detail =
            e instanceof ApiError
              ? `${e.status}: ${e.message || "the server refused"}`
              : e instanceof Error && e.message
                ? e.message
                : "could not reach the server";
          setError(detail);
          reportClientError(e, `play/${gameType}`);
        }
      }
    })();
    return () => {
      startedRef.current = false;
      readiedRef.current = false;
      disconnect();
    };
  }, [loaded, identity, gameType, connect, disconnect]);

  // Auto-ready as soon as the socket is open and this room's state has landed.
  useEffect(() => {
    if (
      !readiedRef.current &&
      status === "open" &&
      room?.id === roomId &&
      room?.status === "waiting"
    ) {
      readiedRef.current = true;
      sendReady();
    }
  }, [status, room, roomId, sendReady]);

  // On finish, go to the (solo-aware) results page. Clay shows its own result
  // in-component, so it opts out of the redirect.
  useEffect(() => {
    if (gameEnd && roomId && room?.id === roomId && gameType !== "clay") {
      const t = setTimeout(() => router.push(`/results/${roomId}`), 600);
      return () => clearTimeout(t);
    }
  }, [gameEnd, roomId, room, router, gameType]);

  if (dailyDone) {
    return (
      <Centered>
        <h1 className="font-[var(--font-display)] text-2xl font-semibold">Today&apos;s pot is done.</h1>
        <p className="max-w-sm text-[var(--color-text-secondary)]">{dailyDone}</p>
        <div className="flex gap-2">
          <Button onClick={() => router.push("/play/clay")}>Play solo</Button>
          <Button variant="secondary" onClick={() => router.push("/")}>Hub</Button>
        </div>
      </Centered>
    );
  }

  if (error) {
    return (
      <Centered>
        <h1 className="font-[var(--font-display)] text-2xl font-semibold">
          Couldn&apos;t start that game.
        </h1>
        <p className="max-w-sm font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
          {error}
        </p>
        <div className="flex w-full max-w-xs flex-col gap-2">
          <Button
            full
            onClick={() => {
              startedRef.current = false;
              setError(null);
            }}
          >
            Try again
          </Button>
          <Button variant="secondary" full onClick={() => router.push("/")}>
            Back to hub
          </Button>
        </div>
      </Centered>
    );
  }

  if (loaded && !identity) {
    return <AuthModal open title="Play solo" />;
  }

  const ready = !!room && room.id === roomId;
  if (ready && game && room!.status !== "waiting") {
    return (
      <>
        <ConnectionBadge status={status} />
        <GameShell />
      </>
    );
  }

  // Branded loader while the room is created + the socket connects. We don't
  // show the connection badge here — a first-connect "disconnected" flash reads
  // as an error; the portal itself signals "setting up".
  return <StartingScreen gameName={gameName} />;
}

function StartingScreen({ gameName }: { gameName: string | null }) {
  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center gap-7 overflow-hidden px-6 text-center">
      <div className="relative flex h-44 w-44 items-center justify-center">
        <motion.div
          className="absolute inset-0 rounded-full bg-[radial-gradient(circle,var(--color-primary-glow),transparent_68%)]"
          animate={{ scale: [1, 1.14, 1], opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute inset-5 rounded-full border border-[var(--color-primary)]/70"
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute inset-10 rounded-full border border-dashed border-[var(--color-cyan)]/60"
          animate={{ rotate: -360 }}
          transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="h-3 w-3 rounded-full bg-[var(--color-primary)] shadow-[0_0_18px_var(--color-primary)]"
          animate={{ scale: [1, 1.4, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
      <div>
        <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-secondary)]">
          solo
        </div>
        <h1 className="mt-1 font-[var(--font-display)] text-3xl font-semibold">
          {gameName ?? "Loading"}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          setting up your run…
        </p>
      </div>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      {children}
    </main>
  );
}
