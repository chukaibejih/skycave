"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { GameCard, isNewGame } from "@/components/ui/GameCard";
import { SignalFlow } from "@/components/hub/SignalFlow";
import { CaveDoor } from "@/components/hub/CaveDoor";
import { AuthModal } from "@/components/ui/AuthModal";
import { Avatar } from "@/components/ui/Avatar";
import { createRoom, listGames } from "@/lib/api";
import { gameSlug } from "@/lib/solo";
import { useAuth } from "@/lib/store";
import type { GameInfo, Identity } from "@/lib/types";

// Paint before the first frame on the client (no "syncing" flash) but fall back to
// a plain effect on the server, where layout effects do not run.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
const GAMES_CACHE = "skycave_games";

export default function Home() {
  const router = useRouter();
  const { identity, loaded, hydrate, logout } = useAuth();
  const [games, setGames] = useState<GameInfo[]>([]);
  const [authOpen, setAuthOpen] = useState(false);
  // Game whose mode is being chosen, and the pending {game, mode} awaiting auth.
  const [chooser, setChooser] = useState<GameInfo | null>(null);
  const [pending, setPending] = useState<{ game: GameInfo; mode: "versus" | "solo" | "daily" } | null>(null);
  const [creating, setCreating] = useState(false);

  // Instant dock + signal from the cached catalog (rendered before paint), so
  // repeat visitors never see the "syncing" state.
  useIsoLayoutEffect(() => {
    try {
      const cached = localStorage.getItem(GAMES_CACHE);
      if (cached) setGames(JSON.parse(cached) as GameInfo[]);
    } catch {
      /* ignore */
    }
  }, []);

  // Revalidate in the background; the catalog only changes on deploy.
  useEffect(() => {
    hydrate();
    listGames()
      .then((g) => {
        setGames(g);
        try {
          localStorage.setItem(GAMES_CACHE, JSON.stringify(g));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
  }, [hydrate]);

  const go = async (game: GameInfo, m: "versus" | "solo" | "daily") => {
    if (m === "solo" || m === "daily") {
      // Solo + daily skip the lobby — the /play route creates the room + drops
      // in. Daily passes ?mode=daily so /play creates a daily room.
      router.push(`/play/${gameSlug(game.type)}${m === "daily" ? "?mode=daily" : ""}`);
      return;
    }
    setCreating(true);
    try {
      const room = await createRoom(game.type);
      router.push(`/room/${room.id}`);
    } finally {
      setCreating(false);
    }
  };

  // Tapping any game opens the mode chooser (no hidden mode state). Stable
  // reference so the memoized orbit/cards don't re-render on modal open/close.
  const launch = useCallback((game: GameInfo) => setChooser(game), []);

  const choose = async (game: GameInfo, m: "versus" | "solo" | "daily") => {
    setChooser(null);
    if (!identity) {
      setPending({ game, mode: m }); // auth first, then launch
      setAuthOpen(true);
      return;
    }
    await go(game, m);
  };

  return (
    <main className="relative mx-auto min-h-[100dvh] w-full max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
      <header className="flex items-center justify-between py-5">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_0_28px_var(--color-primary-glow)]">
            <div className="h-3 w-3 rounded-full bg-[var(--color-cyan)] shadow-[0_0_18px_var(--color-cyan)]" />
          </div>
          <div className="font-[var(--font-display)] text-xl font-semibold">
            sky<span className="text-[var(--color-primary)]">cave</span>
          </div>
        </div>
        {loaded && identity ? (
          <AccountMenu identity={identity} onLogout={logout} />
        ) : (
          <button
            onClick={() => setAuthOpen(true)}
            className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-4 text-sm font-medium text-[var(--color-text-primary)] active:border-[var(--color-primary)]"
          >
            Bluesky login
          </button>
        )}
      </header>

      <section className="py-6 lg:py-10">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 mx-auto max-w-3xl text-center lg:mx-0 lg:text-left"
        >
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-3 py-2 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)] shadow-[0_0_12px_var(--color-success)]" />
            live rooms / instant invites
          </div>

          <h1 className="font-[var(--font-display)] text-[clamp(2.6rem,7vw,5.5rem)] font-semibold leading-[0.95]">
            Play from the
            <span className="text-[var(--color-primary)]"> Skycave.</span>
          </h1>
          <p
            style={{ color: "var(--color-text-secondary)" }}
            className="mx-auto mt-5 max-w-xl text-base leading-7 lg:mx-0 lg:text-lg"
          >
            Fast games built for Bluesky. Play solo and post your score, or
            open a 1v1 room and let anyone tap in straight from the link.
          </p>

          <Link
            href="/leaderboard"
            className="mt-6 inline-flex h-12 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-5 text-sm font-semibold text-[var(--color-text-primary)] transition-colors active:border-[var(--color-primary)]"
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-gold)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
            Leaderboard
            <span aria-hidden className="text-[var(--color-text-secondary)]">
              →
            </span>
          </Link>
        </motion.div>

        {/* Signal-flow hub: games stream along the wave; tap one to play. */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.7 }}
          className="mt-8 lg:mt-12"
        >
          <div className="mb-3 flex justify-center lg:justify-start">
            <div
              style={{
                borderColor: "color-mix(in srgb, var(--color-primary) 45%, transparent)",
                background: "color-mix(in srgb, var(--color-primary) 14%, transparent)",
              }}
              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-primary)]"
            >
              <motion.span
                className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)] shadow-[0_0_12px_var(--color-primary)]"
                animate={{ scale: [1, 1.6, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              />
              tap a game as it flows by
            </div>
          </div>
          <SignalFlow games={games} onPlay={launch} />
        </motion.div>
      </section>

      <section className="pb-10">
        <CaveDoor />
      </section>

      <section className="pb-12">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
              choose your duel
            </p>
            <h2 className="mt-2 font-[var(--font-display)] text-2xl font-semibold">
              Game dock
            </h2>
          </div>
          <p className="hidden max-w-xs text-right text-sm text-[var(--color-text-secondary)] sm:block">
            Tap a game, then pick 1v1 or solo.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {/* NEW games float to the top of the dock; a stable sort keeps the rest in
            order. They drop back automatically once their NEW window expires. */}
        {[...games].sort((a, b) => (isNewGame(b.type) ? 1 : 0) - (isNewGame(a.type) ? 1 : 0)).map((g) => (
          <GameCard key={g.type} game={g} onPlay={launch} />
        ))}
        {games.length === 0 && (
          <div className="panel col-span-full rounded-[22px] py-16 text-center text-sm text-[var(--color-text-secondary)]">
            syncing game dock...
          </div>
        )}
        </div>
      </section>

      {creating && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-md">
          <div className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3 font-[var(--font-mono)] text-xs uppercase tracking-[0.16em] text-[var(--color-text-secondary)] shadow-[0_0_50px_var(--color-primary-glow)]">
            opening portal...
          </div>
        </div>
      )}

      <ModeChooser
        game={chooser}
        onClose={() => setChooser(null)}
        onChoose={choose}
      />

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthed={() => {
          setAuthOpen(false);
          const p = pending;
          setPending(null);
          if (p) go(p.game, p.mode); // resume the chosen launch now that we're authed
        }}
      />
    </main>
  );
}

// Identity chip that opens a small menu with Log out. Same control for guests
// and Bluesky users; the logout flow underneath handles the difference.
function AccountMenu({
  identity,
  onLogout,
}: {
  identity: Identity;
  onLogout: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const label = identity.is_guest ? identity.display_name : `@${identity.handle}`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-3 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/70 py-1 pl-4 pr-1 active:border-[var(--color-primary)]"
      >
        <span className="hidden max-w-[150px] truncate font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)] sm:block">
          {label}
        </span>
        <Avatar
          id={identity.id}
          name={identity.display_name}
          avatarUrl={identity.avatar_url}
          size={36}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-[16px] border border-[var(--color-border)] bg-[var(--color-elevated)] shadow-xl"
          >
            <div className="border-b border-[var(--color-border)] px-4 py-3">
              <div className="truncate text-sm font-semibold">
                {identity.display_name}
              </div>
              <div className="truncate font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
                {identity.is_guest ? "playing as guest" : `@${identity.handle}`}
              </div>
            </div>
            {!identity.is_guest && (
              <Link
                href={`/u/${identity.handle}`}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2.5 border-b border-[var(--color-border)] px-4 py-3 text-left text-sm active:bg-[var(--color-surface)]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                My profile
              </Link>
            )}
            <button
              role="menuitem"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await onLogout();
                setOpen(false);
                setBusy(false);
              }}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-[var(--color-warm)] active:bg-[var(--color-surface)] disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="m16 17 5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
              {busy ? "Logging out..." : "Log out"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Tap a game -> choose 1v1 or solo. No hidden mode; the choice is explicit.
function ModeChooser({
  game,
  onClose,
  onChoose,
}: {
  game: GameInfo | null;
  onClose: () => void;
  onChoose: (game: GameInfo, mode: "versus" | "solo" | "daily") => void;
}) {
  return (
    <AnimatePresence>
      {game && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-sm rounded-[24px] border border-[var(--color-border)] bg-[var(--color-elevated)] p-6"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-5 text-center font-[var(--font-display)] text-xl font-bold">
              {game.name}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => onChoose(game, "versus")}
                className="flex h-28 items-center justify-center rounded-[var(--radius-card)] bg-[var(--color-primary)] font-[var(--font-display)] text-xl font-bold text-white shadow-[0_0_28px_var(--color-primary-glow)] active:brightness-110"
              >
                1v1
              </button>
              <button
                onClick={() => onChoose(game, "solo")}
                className="flex h-28 items-center justify-center rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] font-[var(--font-display)] text-xl font-bold text-[var(--color-text-primary)] active:border-[var(--color-primary)]"
              >
                Solo
              </button>
            </div>
            {game.type === "clay" && (
              <button
                onClick={() => onChoose(game, "daily")}
                className="mt-3 flex h-16 w-full flex-col items-center justify-center rounded-[var(--radius-card)] border font-[var(--font-display)] active:brightness-110"
                style={{
                  borderColor: "color-mix(in srgb, var(--color-warm) 55%, transparent)",
                  background: "color-mix(in srgb, var(--color-warm) 12%, transparent)",
                }}
              >
                <span className="text-lg font-bold">Daily Pot</span>
                <span className="font-[var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
                  once a day · 45s · bonus
                </span>
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
