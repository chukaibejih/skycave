"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { GameCard } from "@/components/ui/GameCard";
import { CoffeeFooter } from "@/components/ui/CoffeeFooter";
import { SignalFlow } from "@/components/hub/SignalFlow";
import { AuthModal } from "@/components/ui/AuthModal";
import { Avatar } from "@/components/ui/Avatar";
import { TournamentBanner } from "@/components/tournament/TournamentBanner";
import { ArcadeShelves } from "@/components/hub/ArcadeShelves";
import { createRoom, listGames } from "@/lib/api";
import { gameSlug } from "@/lib/solo";
import { useAuth } from "@/lib/store";
import type { GameInfo, Identity } from "@/lib/types";

// Paint before the first frame on the client (no "syncing" flash) but fall back to
// a plain effect on the server, where layout effects do not run.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
const GAMES_CACHE = "skycave_games_v2";

export default function Home() {
  const router = useRouter();
  const { identity, loaded, hydrate, logout } = useAuth();
  const [games, setGames] = useState<GameInfo[]>([]);
  const [authOpen, setAuthOpen] = useState(false);
  // Game whose mode is being chosen, and the pending {game, mode} awaiting auth.
  const [chooser, setChooser] = useState<GameInfo | null>(null);
  const [pending, setPending] = useState<{ game: GameInfo; mode: "versus" | "solo" | "daily"; difficulty?: "easy" | "normal" | "hard"; settings?: Record<string, any> } | null>(null);
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

  const go = async (
    game: GameInfo,
    m: "versus" | "solo" | "daily",
    difficulty: "easy" | "normal" | "hard" = "normal",
    settings?: Record<string, any>
  ) => {
    if (m === "solo" || m === "daily") {
      // Solo + daily skip the lobby - the /play route creates the room + drops
      // in. Daily passes ?mode=daily; solo passes the chosen Caver difficulty.
      let qs = m === "daily" ? "?mode=daily" : `?diff=${difficulty}`;
      if (settings?.category) qs += `&cat=${settings.category}`;
      router.push(`/play/${gameSlug(game.type)}${qs}`);
      return;
    }
    setCreating(true);
    try {
      const room = await createRoom(game.type, "versus", "normal", settings);
      router.push(`/room/${room.id}`);
    } finally {
      setCreating(false);
    }
  };

  // Tapping any game opens the mode chooser (no hidden mode state). Stable
  // reference so the memoized orbit/cards don't re-render on modal open/close.
  const launch = useCallback((game: GameInfo) => setChooser(game), []);

  const choose = async (
    game: GameInfo,
    m: "versus" | "solo" | "daily",
    difficulty: "easy" | "normal" | "hard" = "normal",
    settings?: Record<string, any>
  ) => {
    setChooser(null);
    if (!identity) {
      setPending({ game, mode: m, difficulty, settings }); // auth first, then launch
      setAuthOpen(true);
      return;
    }
    await go(game, m, difficulty, settings);
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
        <div className="flex items-center gap-2">
          <HeaderNav />
          {loaded && identity ? (
            <AccountMenu identity={identity} onLogout={logout} />
          ) : (
            <button
              onClick={() => setAuthOpen(true)}
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] active:border-[var(--color-primary)]"
            >
              Bluesky login
            </button>
          )}
        </div>
      </header>

      <section className="py-6 lg:py-10">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 mx-auto max-w-3xl text-center lg:mx-0 lg:text-left"
        >
          <h1 className="font-[var(--font-display)] text-[clamp(2.6rem,7vw,5.5rem)] font-semibold leading-[0.95]">
            Play from the
            <span className="text-[var(--color-primary)]"> Skycave.</span>
          </h1>
          <p
            style={{ color: "var(--color-text-secondary)" }}
            className="mx-auto mt-5 max-w-xl text-base leading-7 lg:mx-0 lg:text-lg"
          >
            Jump into quick solo runs, 1v1, and weekend battles built for
            Bluesky, Blacksky, and beyond.
          </p>
        </motion.div>

        {/* Signal-flow hub: games stream along the wave; tap one to play. */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.7 }}
          className="mt-6 lg:mt-10"
        >
          <SignalFlow games={games} onPlay={launch} />
        </motion.div>
      </section>

      {/* Match day. The one warm thing on the page, and the only way into the
          tournament world now the toggle is gone. */}
      <section className="pb-2">
        <TournamentBanner />
      </section>

      {/* The Cave is hidden from the hub for now. The component and its /cave
          routes are untouched, so restoring it is putting this section back. */}

      <section className="pt-4 pb-12">
        {games.length > 0 ? (
          <ArcadeShelves games={games} onPlay={launch} />
        ) : (
          <div className="panel col-span-full rounded-[22px] py-16 text-center text-sm text-[var(--color-text-secondary)]">
            syncing game dock...
          </div>
        )}
      </section>

      <CoffeeFooter />

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
          if (p) go(p.game, p.mode, p.difficulty, p.settings); // resume the chosen launch now that we're authed
        }}
      />
    </main>
  );
}

// Secondary destinations, pulled out of the hero so the headline reads straight
// into the orbit. Icon-only to stay compact next to the account chip; labels are
// carried by aria-label/title for reach and hover.
function HeaderNav() {
  const item =
    "grid h-9 w-9 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/70 transition-colors active:border-[var(--color-primary)]";
  return (
    <nav className="flex items-center gap-1.5">
      <Link href="/leaderboard" aria-label="Leaderboard" title="Leaderboard" className={item}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
          <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </svg>
      </Link>
      <Link href="/hall-of-fame" aria-label="Hall of Fame" title="Hall of Fame" className={item}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m12 2 2.4 6.9H21l-5.3 4 2 6.9-5.7-4.3L6.3 20l2-7-5.3-4h6.6L12 2Z" />
        </svg>
      </Link>
      <Link href="/friends" aria-label="Friends" title="Friends" className={item}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--color-cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </Link>
    </nav>
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
  onChoose: (game: GameInfo, mode: "versus" | "solo" | "daily", difficulty?: "easy" | "normal" | "hard", settings?: Record<string, any>) => void;
}) {
  const [step, setStep] = useState<"mode" | "difficulty" | "category">("mode");
  const [chosenMode, setChosenMode] = useState<"versus" | "solo" | null>(null);

  useEffect(() => {
    setStep(
      game && game.versus_enabled === false && game.supports_difficulty ? "difficulty" : "mode",
    );
    setChosenMode(null);
  }, [game]);

  const onVersus = () => {
    if (!game) return;
    if (game.type === "mad_math") {
      setChosenMode("versus");
      setStep("category");
      return;
    }
    onChoose(game, "versus");
  };

  const onSolo = () => {
    if (!game) return;
    setChosenMode("solo");
    if (game.supports_difficulty) {
      setStep("difficulty");
      return;
    }
    if (game.type === "mad_math") {
      setStep("category");
      return;
    }
    onChoose(game, "solo", "normal");
  };

  const launchSoloDiff = (level: "easy" | "normal" | "hard") => {
    if (!game) return;
    try {
      localStorage.setItem("skycave_caver_diff", level);
    } catch {
      /* ignore */
    }
    if (game.type === "mad_math") {
      setStep("category");
      return;
    }
    onChoose(game, "solo", level);
  };

  const launchCategory = (cat: string) => {
    if (!game || !chosenMode) return;
    onChoose(game, chosenMode, "normal", { category: cat });
  };

  const DIFF_DESC: Record<"easy" | "normal" | "hard", string> = {
    easy: "Gentle · good for learning",
    normal: "A real match",
    hard: "Sharp · never blunders",
  };

  const CATS = [
    { id: "addition", label: "Addition", desc: "Just sums" },
    { id: "subtraction", label: "Subtraction", desc: "Just differences" },
    { id: "multiplication", label: "Multiplication", desc: "Just times tables" },
    { id: "random", label: "Random Mix", desc: "Anything goes" },
  ];

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
            {step === "mode" ? (
              <div className={`grid gap-3 ${game.versus_enabled === false ? "grid-cols-1" : "grid-cols-2"}`}>
                {game.versus_enabled !== false && (
                  <button
                    onClick={onVersus}
                    className="flex h-28 items-center justify-center rounded-[var(--radius-card)] bg-[var(--color-primary)] font-[var(--font-display)] text-xl font-bold text-white shadow-[0_0_28px_var(--color-primary-glow)] active:brightness-110"
                  >
                    1v1
                  </button>
                )}
                <button
                  onClick={onSolo}
                  className="flex h-28 items-center justify-center rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] font-[var(--font-display)] text-xl font-bold text-[var(--color-text-primary)] active:border-[var(--color-primary)]"
                >
                  Solo
                </button>
              </div>
            ) : step === "difficulty" ? (
              <div>
                <p className="mb-3 text-center font-[var(--font-mono)] text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
                  Caver difficulty
                </p>
                <div className="flex flex-col gap-2">
                  {(["easy", "normal", "hard"] as const).map((l) => (
                    <button
                      key={l}
                      onClick={() => launchSoloDiff(l)}
                      className="flex items-center justify-between rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-left transition-colors active:border-[var(--color-primary)]"
                    >
                      <span
                        className="font-[var(--font-display)] text-base font-bold capitalize"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {l}
                      </span>
                      <span className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                        {DIFF_DESC[l]}
                      </span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => (game.versus_enabled === false ? onClose() : setStep("mode"))}
                  className="mt-3 w-full text-center font-[var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-secondary)]"
                >
                  {game.versus_enabled === false ? "close" : "back"}
                </button>
              </div>
            ) : (
              <div>
                <p className="mb-3 text-center font-[var(--font-mono)] text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
                  Math Category
                </p>
                <div className="flex flex-col gap-2">
                  {CATS.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => launchCategory(c.id)}
                      className="flex items-center justify-between rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-left transition-colors active:border-[var(--color-primary)]"
                    >
                      <span
                        className="font-[var(--font-display)] text-base font-bold capitalize"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {c.label}
                      </span>
                      <span className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                        {c.desc}
                      </span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setStep("mode")}
                  className="mt-3 w-full text-center font-[var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-secondary)]"
                >
                  back
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
