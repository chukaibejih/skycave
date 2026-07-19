"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { RoomPortal } from "@/components/lobby/RoomPortal";
import { PlayerCard } from "@/components/lobby/PlayerCard";
import { InvitePanel } from "@/components/lobby/InvitePanel";
import { RoomCountdown } from "@/components/lobby/RoomCountdown";
import { ConnectionBadge } from "@/components/ui/ConnectionBadge";
import { AuthModal } from "@/components/ui/AuthModal";
import { Button } from "@/components/ui/Button";
import { GameShell } from "@/components/games/GameShell";
import { GameOver } from "@/components/games/GameOver";
import { preloadGlobe } from "@/components/games/GlobePicker";
import { createRoom, getInvite, getRoom, joinRoom } from "@/lib/api";
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
    roomExpired,
    connect,
    disconnect,
    sendReady,
  } = useRoom();

  const [notFound, setNotFound] = useState(false);
  const [landedExpired, setLandedExpired] = useState(false); // arrived after it closed
  const [timedOut, setTimedOut] = useState(false); // countdown reached zero locally
  const [inviteText, setInviteText] = useState("");
  const [iAmReady, setIAmReady] = useState(false);
  // Guards the join+connect to run exactly once per mount. Critically it does
  // NOT depend on `room`, so the socket's `room: null` reset can't re-trigger
  // it. That race was causing a rapid connect/disconnect loop on the joiner
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
        const existing = await getRoom(id); // existence check (404 -> notFound)
        // Landed on a link whose window already closed: show the closed page
        // instead of joining a dead room.
        if (existing.status === "expired") {
          setLandedExpired(true);
          return;
        }
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

  // Solo has no opponent to rematch, so it heads straight to the results / score
  // card screen. Versus stays in the room and shows the seamless rematch screen
  // (below), keeping both players and the live socket together.
  useEffect(() => {
    // Clay shows its own result overlay (score + play again), so don't bounce
    // solo Clay to the shared results page.
    if (gameEnd && room?.id === id && room?.mode === "solo" && room?.game_type !== "clay") {
      const t = setTimeout(() => router.push(`/results/${id}`), 600);
      return () => clearTimeout(t);
    }
  }, [gameEnd, room, id, router]);

  // Stable so RoomCountdown does not re-subscribe every second.
  const onCountdownExpire = useCallback(() => setTimedOut(true), []);

  // Fresh landing on a link whose window already closed: a clean, intentional
  // closed page rather than a 404 or a dead lobby.
  if (landedExpired) {
    return (
      <Centered>
        <h1 className="font-[var(--font-display)] text-2xl font-semibold">
          this room is closed.
        </h1>
        <p className="max-w-sm text-[var(--color-text-secondary)]">
          the invite expired or the game already ended.
        </p>
        <Button onClick={() => router.push("/")}>start your own game</Button>
      </Centered>
    );
  }

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

  // Versus game finished: stay in the room and offer a seamless rematch on the
  // same room. Solo redirected to results above, so this is versus only.
  if (ready && gameEnd && room!.status === "finished" && room!.mode !== "solo" && room!.game_type !== "clay") {
    return (
      <>
        <ConnectionBadge status={status} />
        <GameOver roomId={id} />
      </>
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

  // Host was waiting and the room closed (ROOM_EXPIRED arrived, or the countdown
  // hit zero). Let them choose what to do next, no auto-redirect.
  if (roomExpired || timedOut) {
    return (
      <Centered>
        <h1 className="font-[var(--font-display)] text-2xl font-semibold">
          your room closed. nobody joined.
        </h1>
        <div className="flex w-full max-w-xs flex-col gap-3">
          <Button
            full
            onClick={async () => {
              try {
                const fresh = await createRoom(room?.game_type ?? "");
                router.push(`/room/${fresh.id}`);
              } catch {
                router.push("/");
              }
            }}
          >
            create a new room
          </Button>
          <Button variant="secondary" full onClick={() => router.push("/")}>
            go home
          </Button>
        </div>
      </Centered>
    );
  }

  // Lobby. Until this room's state has loaded, show no stale players.
  const players = ready ? room!.players : [];
  const opponent = players.find((p) => p.id !== identity?.id) ?? null;
  const me = players.find((p) => p.id === identity?.id) ?? null;
  const bothHere = players.length >= 2;

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5 pb-[max(env(safe-area-inset-bottom),20px)]">
      <ConnectionBadge status={status} />

      <header className="flex items-center gap-2 py-4">
        <button
          onClick={() => router.push("/")}
          aria-label="Back to hub"
          className="shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-4 py-1.5 text-sm text-[var(--color-text-secondary)] active:text-[var(--color-text-primary)]"
        >
          hub
        </button>
        <div className="flex-1 text-center font-[var(--font-mono)] text-lg font-semibold tracking-[0.14em]">
          {id}
        </div>
        <div className="flex min-w-[64px] shrink-0 justify-end">
          {!bothHere && room?.expires_at != null && (
            <RoomCountdown expiresAt={room.expires_at} onExpire={onCountdownExpire} />
          )}
        </div>
      </header>

      {/* Ambient portal — a small sign of life above the slots, not the hero. */}
      <div className="flex justify-center pb-5 pt-1">
        <RoomPortal filled={bothHere} size={92} compact />
      </div>

      {/* The real content of this screen: who is in the room. */}
      <div className="space-y-3">
        <PlayerCard player={me} accent="primary" label="you" />
        <PlayerCard
          player={opponent}
          accent="primary"
          label="opponent"
          emptyLabel="open seat"
        />
      </div>

      {/* Actions, in priority order, all reachable without scrolling. */}
      <div className="mt-5 space-y-3">
        {!bothHere && (
          <InvitePanel
            roomCode={id}
            gameName={room?.game_name ?? room?.game_type ?? "this game"}
            inviteText={inviteText}
          />
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
