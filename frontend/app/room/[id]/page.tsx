"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { RoomPortal } from "@/components/lobby/RoomPortal";
import { PlayerCard } from "@/components/lobby/PlayerCard";
import { ShareButton } from "@/components/lobby/ShareButton";
import { ConnectionBadge } from "@/components/ui/ConnectionBadge";
import { AuthModal } from "@/components/ui/AuthModal";
import { Button } from "@/components/ui/Button";
import { GameShell } from "@/components/games/GameShell";
import { preloadGlobe } from "@/components/games/GlobePicker";
import { getInvite, getRoom, joinRoom } from "@/lib/api";
import { useAuth, useRoom } from "@/lib/store";

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { identity, loaded, hydrate } = useAuth();
  const {
    room,
    status,
    game,
    gameEnd,
    connect,
    disconnect,
    sendReady,
  } = useRoom();

  const [notFound, setNotFound] = useState(false);
  const [inviteText, setInviteText] = useState("");
  const [iAmReady, setIAmReady] = useState(false);
  // Guards the join+connect to run exactly once per mount. Critically it does
  // NOT depend on `room`, so the socket's `room: null` reset can't re-trigger
  // it — that race was causing a rapid connect/disconnect loop on the joiner
  // (worse over high-latency mobile, where ROOM_STATE lands after the re-run).
  const startedRef = useRef(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Warm the heavy globe bundle + texture during the lobby, so GeoGuess round 1
  // renders instantly instead of downloading ~2MB while the timer is running.
  useEffect(() => {
    if (room?.game_type === "geoguess") preloadGlobe();
  }, [room?.game_type]);

  // Once authed, join (idempotent) + open the live socket.
  useEffect(() => {
    if (!loaded || !identity || startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        await getRoom(id); // existence check (404 -> notFound)
        await joinRoom(id);
        getInvite(id).then((r) => setInviteText(r.text)).catch(() => {});
        connect(id);
      } catch {
        startedRef.current = false;
        setNotFound(true);
      }
    })();
    return () => {
      // Allow a clean re-init on remount (e.g. React StrictMode dev cycle).
      startedRef.current = false;
      disconnect();
    };
  }, [loaded, identity, id, connect, disconnect]);

  // True only when the global store actually reflects THIS room. The store is a
  // singleton, so right after navigating from a finished game it still holds the
  // previous room's state (room/game/gameEnd) until this room's ROOM_STATE lands.
  // Gating on room.id prevents flashing the old game and mis-routing to results.
  const ready = !!room && room.id === id;

  // When *this* game ends, head to results.
  useEffect(() => {
    if (gameEnd && room?.id === id) {
      const t = setTimeout(() => router.push(`/results/${id}`), 600);
      return () => clearTimeout(t);
    }
  }, [gameEnd, room, id, router]);

  if (notFound) {
    return (
      <Centered>
        <p className="text-[var(--color-text-secondary)]">
          This room does not exist or has expired.
        </p>
        <Button variant="secondary" onClick={() => router.push("/")}>
          Back to hub
        </Button>
      </Centered>
    );
  }

  if (loaded && !identity) {
    return (
      <AuthModal
        open
        title="Join the game"
        onAuthed={() => {
          /* effect above will join + connect */
        }}
      />
    );
  }

  // In-game (only when the store is showing this room, not a stale one).
  if (ready && game && room!.status !== "waiting") {
    return (
      <>
        <ConnectionBadge status={status} />
        <GameShell />
      </>
    );
  }

  // Lobby. Until this room's state has loaded, show no stale players.
  const players = ready ? room!.players : [];
  const opponent = players.find((p) => p.id !== identity?.id) ?? null;
  const me = players.find((p) => p.id === identity?.id) ?? null;
  const bothHere = players.length >= 2;

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col px-5 pb-[max(env(safe-area-inset-bottom),24px)]">
      <ConnectionBadge status={status} />

      <header className="flex items-center justify-between py-5">
        <button
          onClick={() => router.push("/")}
          className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-4 text-sm text-[var(--color-text-secondary)] active:text-[var(--color-text-primary)]"
        >
          hub
        </button>
        <div className="text-center">
          <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
            room code
          </div>
          <div className="font-[var(--font-mono)] text-2xl font-semibold tracking-[0.2em]">
            {id}
          </div>
        </div>
        <div className="w-10" />
      </header>

      <div className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="flex flex-col items-center justify-center text-center">
          <div className="mb-5 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
            {bothHere ? "opponent locked" : "waiting room"}
          </div>
          <RoomPortal filled={bothHere} size={280} />
          <h1 className="mt-8 max-w-md font-[var(--font-display)] text-3xl font-semibold leading-tight sm:text-4xl">
            {bothHere ? "Ready the match." : "Your portal is open."}
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-[var(--color-text-secondary)]">
            {bothHere
              ? "Both players are in. Tap ready when you want the first round to start."
              : "Share the room link and the second player will appear here instantly."}
          </p>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-[var(--font-display)] text-xl font-semibold">
              Players
            </h2>
            <span className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
              {players.length}/2 online
            </span>
          </div>
          <div className="space-y-3">
          <PlayerCard player={me} accent="primary" label="you" />
          <PlayerCard player={opponent} accent="warm" label="opponent" />
          </div>
          <div className="mt-6 space-y-3">
            {!bothHere && inviteText && (
              <>
                <ShareButton text={inviteText} full />
                <p className="text-center text-xs text-[var(--color-text-secondary)]">
                  Post the invite on Bluesky. No account is required for the
                  other player.
                </p>
              </>
            )}

            {bothHere && (
              <Button
                full
                disabled={iAmReady}
                onClick={() => {
                  setIAmReady(true);
                  sendReady();
                }}
              >
                {iAmReady ? "waiting for opponent..." : "Ready"}
              </Button>
            )}
          </div>
        </section>
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
