"use client";
import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { GameShell } from "@/components/games/GameShell";
import { SpectatorLayer } from "@/components/games/SpectatorLayer";
import { getMatchWatch, type WatchPlayer, type WatchState } from "@/lib/api";
import { useAuth, useRoom } from "@/lib/store";

const POLL_MS = 2500;
// A small palette for the reaction bar (the server accepts a few more).
const BAR = ["🔥", "👏", "😂", "😮", "🎉", "🐐"];

export default function WatchPage({
  params,
}: {
  params: Promise<{ id: string; round: string; slot: string }>;
}) {
  const { id, round, slot } = use(params);
  const r = Number(round);
  const s = Number(slot);

  const { identity, hydrate } = useAuth();
  const spectate = useRoom((x) => x.spectate);
  const disconnect = useRoom((x) => x.disconnect);
  const sendReaction = useRoom((x) => x.sendReaction);
  const game = useRoom((x) => x.game);
  const room = useRoom((x) => x.room);

  const [watch, setWatch] = useState<WatchState | null>(null);
  const roomRef = useRef<string | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Follow the match: poll its live room and hop the spectator socket as each
  // leg opens; drop the socket between legs so we fall back to the holding view.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const w = await getMatchWatch(id, r, s);
        if (!alive) return;
        setWatch(w);
        if (w.status === "live" && w.live_room_id) {
          if (roomRef.current !== w.live_room_id) {
            roomRef.current = w.live_room_id;
            spectate(w.live_room_id);
          }
        } else if (roomRef.current) {
          roomRef.current = null;
          disconnect();
        }
      } catch {
        /* keep the last known state */
      }
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
      disconnect();
      roomRef.current = null;
    };
  }, [id, r, s, spectate, disconnect]);

  const canReact = !!identity && !identity.is_guest;
  const live = watch?.status === "live";
  const inGame = live && !!room && !!game;

  return (
    <main className="relative mx-auto min-h-[100dvh] w-full max-w-2xl px-4 pb-24 sm:px-6">
      {/* Back + "watching" chip, always reachable, even over the live board. */}
      <div className="fixed left-3 top-3 z-50 flex items-center gap-2">
        <Link
          href={`/tournament/${id}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/80 px-3 py-1.5 text-sm font-medium text-[var(--color-text-secondary)] backdrop-blur-md active:border-[var(--color-primary)]"
        >
          <span aria-hidden>←</span> Bracket
        </Link>
        {live && (
          <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.14em] backdrop-blur-md"
            style={{ borderColor: "color-mix(in srgb, var(--color-warm) 55%, transparent)", color: "var(--color-warm)", background: "var(--color-surface)" }}>
            watching
          </span>
        )}
      </div>

      {inGame ? (
        <>
          <GameShell />
          <SpectatorLayer />
        </>
      ) : (
        <Holding watch={watch} live={live} />
      )}

      {live && (
        <ReactionBar canReact={canReact} onReact={sendReaction} />
      )}
    </main>
  );
}

function Holding({ watch, live }: { watch: WatchState | null; live: boolean }) {
  if (!watch) {
    return <Centered><p className="text-[var(--color-text-secondary)]">Loading the match...</p></Centered>;
  }
  const [w1, w2] = watch.wins;
  const title =
    watch.status === "finished"
      ? "Match over"
      : live
        ? "Connecting to the live game..."
        : watch.status === "between"
          ? "Next game starting..."
          : watch.status === "waiting"
            ? "Players are checking in..."
            : "This match hasn't started yet.";

  return (
    <Centered>
      <p className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.18em] text-[var(--color-warm)]">
        {watch.round_name}
      </p>
      <div className="mt-6 flex items-center justify-center gap-5">
        <PlayerFace p={watch.player1} champion={watch.winner_did === watch.player1?.did} />
        <div className="text-center">
          <div className="font-[var(--font-display)] text-4xl font-bold tabular-nums">
            {w1} <span className="text-[var(--color-text-secondary)]">-</span> {w2}
          </div>
          <div className="mt-1 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
            best of 3
          </div>
        </div>
        <PlayerFace p={watch.player2} champion={watch.winner_did === watch.player2?.did} />
      </div>
      <p className="mt-8 text-sm text-[var(--color-text-secondary)]">{title}</p>
      {watch.status === "finished" && (
        <p className="mt-2 text-base font-semibold">
          {(watch.winner_did === watch.player1?.did
            ? watch.player1?.display_name
            : watch.player2?.display_name) ?? "Winner"}{" "}
          goes through.
        </p>
      )}
    </Centered>
  );
}

function PlayerFace({ p, champion }: { p: WatchPlayer | null; champion: boolean }) {
  if (!p) {
    return (
      <div className="flex w-24 flex-col items-center gap-2">
        <div className="h-16 w-16 rounded-full border border-dashed border-[var(--color-border)]" />
        <span className="text-xs text-[var(--color-text-secondary)]">TBD</span>
      </div>
    );
  }
  return (
    <div className="flex w-24 flex-col items-center gap-2">
      <div style={{ opacity: champion ? 1 : 0.9 }}>
        <Avatar id={p.did} name={p.display_name} avatarUrl={p.avatar_url ?? undefined} size={64} />
      </div>
      <span className="max-w-full truncate text-center text-sm font-semibold">{p.display_name}</span>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center text-center">
      {children}
    </div>
  );
}

function ReactionBar({ canReact, onReact }: { canReact: boolean; onReact: (e: string) => void }) {
  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      {canReact ? (
        <div className="flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/85 p-1.5 backdrop-blur-md">
          {BAR.map((e) => (
            <button
              key={e}
              onClick={() => onReact(e)}
              className="grid h-11 w-11 place-items-center rounded-full text-2xl transition-transform active:scale-90"
              aria-label={`React ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/85 px-4 py-2 text-xs text-[var(--color-text-secondary)] backdrop-blur-md">
          Connect Bluesky to react
        </div>
      )}
    </div>
  );
}
