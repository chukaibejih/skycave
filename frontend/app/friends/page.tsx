"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Avatar } from "@/components/ui/Avatar";
import { AuthModal } from "@/components/ui/AuthModal";
import { createRoom, getFriends, listGames, type Friend } from "@/lib/api";
import { shareToBluesky } from "@/lib/bluesky";
import { roomUrl } from "@/lib/site";
import { useAuth } from "@/lib/store";
import type { GameInfo } from "@/lib/types";

type Load = "idle" | "loading" | "done" | "error";

export default function FriendsPage() {
  const router = useRouter();
  const { identity, loaded, hydrate } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [state, setState] = useState<Load>("idle");
  const [games, setGames] = useState<GameInfo[]>([]);
  const [pickFor, setPickFor] = useState<Friend | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const isBluesky = !!identity && !identity.is_guest;

  const load = useCallback(() => {
    setState("loading");
    getFriends()
      .then((r) => {
        setFriends(r.friends);
        setState("done");
      })
      .catch(() => setState("error"));
  }, []);

  useEffect(() => {
    if (!loaded || !isBluesky) return;
    load();
    listGames().then(setGames).catch(() => {});
  }, [loaded, isBluesky, load]);

  const startChallenge = async (game: GameInfo) => {
    const friend = pickFor;
    setPickFor(null);
    if (!friend) return;
    setCreating(true);
    try {
      const room = await createRoom(game.type);
      const handle = friend.handle;
      const link = roomUrl(room.id);
      shareToBluesky(`@${handle}, you're up. ${game.name} in the cave 👇\n\n${link}`);
      router.push(`/room/${room.id}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="relative mx-auto min-h-[100dvh] w-full max-w-2xl px-4 pb-20 sm:px-6">
      <Header />

      <div className="mb-6">
        <p className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
          your people
        </p>
        <h1 className="mt-2 font-[var(--font-display)] text-3xl font-semibold">
          Friends
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
          People you follow on Bluesky who already play Skycave. Tap one to
          challenge them straight to a game.
        </p>
      </div>

      {/* States */}
      {!loaded ? (
        <SkeletonList />
      ) : !isBluesky ? (
        <ConnectPrompt guest={!!identity?.is_guest} onConnect={() => setAuthOpen(true)} />
      ) : state === "loading" || state === "idle" ? (
        <SkeletonList />
      ) : state === "error" ? (
        <Empty
          title="Couldn't load your friends"
          body="Something went wrong reaching Bluesky. Give it another try."
          action={{ label: "Retry", onClick: load }}
        />
      ) : friends.length === 0 ? (
        <Empty
          title="No friends on Skycave yet"
          body="None of the people you follow are here yet. Invite a few and this fills up fast."
          action={{
            label: "Invite friends on Bluesky",
            onClick: () =>
              shareToBluesky(
                `come play with me on skycave 👇 fast 1v1 games\n\nhttps://skycave.space`
              ),
          }}
        />
      ) : (
        <motion.ul
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.04 } } }}
          className="space-y-2.5"
        >
          {friends.map((f) => (
            <FriendRow key={f.did} friend={f} onChallenge={() => setPickFor(f)} />
          ))}
        </motion.ul>
      )}

      <GamePicker
        friend={pickFor}
        games={games}
        onClose={() => setPickFor(null)}
        onPick={startChallenge}
      />

      {creating && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-md">
          <div className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3 font-[var(--font-mono)] text-xs uppercase tracking-[0.16em] text-[var(--color-text-secondary)] shadow-[0_0_50px_var(--color-primary-glow)]">
            opening portal...
          </div>
        </div>
      )}

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthed={() => setAuthOpen(false)}
      />
    </main>
  );
}

function Header() {
  return (
    <header className="flex items-center justify-between py-5">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] active:border-[var(--color-primary)]"
      >
        <span aria-hidden>←</span> Hub
      </Link>
      <Link href="/" className="flex items-center gap-3">
        <div className="font-[var(--font-display)] text-xl font-semibold">
          sky<span className="text-[var(--color-primary)]">cave</span>
        </div>
        <div className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_0_28px_var(--color-primary-glow)]">
          <div className="h-3 w-3 rounded-full bg-[var(--color-cyan)] shadow-[0_0_18px_var(--color-cyan)]" />
        </div>
      </Link>
    </header>
  );
}

function FriendRow({ friend, onChallenge }: { friend: Friend; onChallenge: () => void }) {
  const name = friend.display_name || friend.handle;
  return (
    <motion.li
      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
      className="flex items-center gap-3 rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-3"
    >
      <Avatar id={friend.did} name={name} avatarUrl={friend.avatar_url ?? undefined} size={48} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold">{name}</span>
          {friend.is_mutual && (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.12em]"
              style={{
                color: "var(--color-cyan)",
                background: "color-mix(in srgb, var(--color-cyan) 14%, transparent)",
              }}
            >
              Mutual
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 truncate font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
          <span className="truncate">@{friend.handle}</span>
          {friend.games_played > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="shrink-0">{friend.games_played} games</span>
            </>
          )}
        </div>
      </div>
      <button
        onClick={onChallenge}
        className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-[0_0_20px_var(--color-primary-glow)] transition-[filter] active:brightness-110"
        style={{ backgroundColor: "var(--color-primary)" }}
      >
        Challenge
      </button>
    </motion.li>
  );
}

function ConnectPrompt({ guest, onConnect }: { guest: boolean; onConnect: () => void }) {
  return (
    <div className="rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-6 py-12 text-center">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-base)]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </div>
      <h2 className="font-[var(--font-display)] text-xl font-semibold">
        Connect Bluesky to find your friends
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--color-text-secondary)]">
        {guest
          ? "You're playing as a guest. Connect your Bluesky account to see who you follow that plays Skycave."
          : "We'll match the people you follow on Bluesky with everyone on Skycave, so you can challenge them in a tap."}
      </p>
      <button
        onClick={onConnect}
        className="mt-6 inline-flex h-12 items-center justify-center rounded-full px-6 text-sm font-semibold text-white transition-[filter] active:brightness-110"
        style={{ backgroundColor: "#1185FE" }}
      >
        Connect Bluesky
      </button>
    </div>
  );
}

function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-6 py-12 text-center">
      <h2 className="font-[var(--font-display)] text-xl font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--color-text-secondary)]">
        {body}
      </p>
      <button
        onClick={action.onClick}
        className="mt-6 inline-flex h-12 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-6 text-sm font-semibold text-[var(--color-text-primary)] transition-colors active:border-[var(--color-primary)]"
      >
        {action.label}
      </button>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-3"
        >
          <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-[var(--color-border)]" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-1/3 animate-pulse rounded bg-[var(--color-border)]" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--color-border)]" />
          </div>
          <div className="h-9 w-24 shrink-0 animate-pulse rounded-full bg-[var(--color-border)]" />
        </div>
      ))}
    </div>
  );
}

function GamePicker({
  friend,
  games,
  onClose,
  onPick,
}: {
  friend: Friend | null;
  games: GameInfo[];
  onClose: () => void;
  onPick: (game: GameInfo) => void;
}) {
  return (
    <AnimatePresence>
      {friend && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-md rounded-[24px] border border-[var(--color-border)] bg-[var(--color-elevated)] p-5"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-3">
              <Avatar
                id={friend.did}
                name={friend.display_name || friend.handle}
                avatarUrl={friend.avatar_url ?? undefined}
                size={40}
              />
              <div className="min-w-0">
                <div className="text-xs text-[var(--color-text-secondary)]">Challenge</div>
                <div
                  className="truncate font-[var(--font-display)] text-base font-bold"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {friend.display_name || `@${friend.handle}`}
                </div>
              </div>
            </div>

            <p className="mb-3 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
              pick a game
            </p>
            {games.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--color-text-secondary)]">
                loading games...
              </p>
            ) : (
              <div className="grid max-h-[52vh] grid-cols-2 gap-2.5 overflow-y-auto overscroll-contain">
                {games.map((g) => (
                  <button
                    key={g.type}
                    onClick={() => onPick(g)}
                    className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)]/70 p-3 text-left transition-colors active:border-[var(--color-primary)]"
                  >
                    <div className="truncate text-sm font-semibold">{g.name}</div>
                    <div className="mt-0.5 truncate text-xs text-[var(--color-text-secondary)]">
                      {g.tagline}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
