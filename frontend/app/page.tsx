"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { GameCard } from "@/components/ui/GameCard";
import { AuthModal } from "@/components/ui/AuthModal";
import { Avatar } from "@/components/ui/Avatar";
import { createRoom, listGames } from "@/lib/api";
import { useAuth } from "@/lib/store";
import type { GameInfo } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const { identity, loaded, hydrate } = useAuth();
  const [games, setGames] = useState<GameInfo[]>([]);
  const [authOpen, setAuthOpen] = useState(false);
  const [pending, setPending] = useState<GameInfo | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    hydrate();
    listGames().then(setGames).catch(() => setGames([]));
  }, [hydrate]);

  const launch = async (game: GameInfo) => {
    if (!identity) {
      setPending(game);
      setAuthOpen(true);
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
          <div className="flex items-center gap-3 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/70 py-1 pl-4 pr-1">
            <span className="hidden max-w-[150px] truncate font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)] sm:block">
              {identity.is_guest ? identity.display_name : `@${identity.handle}`}
            </span>
            <Avatar
              id={identity.id}
              name={identity.display_name}
              avatarUrl={identity.avatar_url}
              size={36}
            />
          </div>
        ) : (
          <button
            onClick={() => setAuthOpen(true)}
            className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-4 text-sm font-medium text-[var(--color-text-primary)] active:border-[var(--color-primary)]"
          >
            Bluesky login
          </button>
        )}
      </header>

      <section className="grid min-h-[calc(100dvh-88px)] items-center gap-10 py-6 lg:grid-cols-[1.02fr_0.98fr] lg:py-10">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10"
        >
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-3 py-2 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)] shadow-[0_0_12px_var(--color-success)]" />
            live rooms / instant invites
          </div>

          <h1 className="max-w-3xl font-[var(--font-display)] text-[clamp(3rem,8vw,6.75rem)] font-semibold leading-[0.95]">
            Play from the
            <span className="block text-[var(--color-primary)]">Skycave.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-7 text-[var(--color-text-secondary)]">
            Fast 1v1 games built for Bluesky links. Pick a room, post the
            invite, and let anyone drop straight into the match.
          </p>

          <div className="mt-8 grid max-w-xl grid-cols-3 gap-2 rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface)]/55 p-2">
            <Stat value={games.length ? String(games.length) : "—"} label="games" />
            <Stat value="1v1" label="live rooms" />
            <Stat value="0" label="account walls" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.7 }}
          className="relative mx-auto flex aspect-square w-full max-w-[520px] items-center justify-center"
        >
          <HubPortal games={games} onPlay={launch} />
        </motion.div>
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
            Every card creates a room and gives you a link ready for Bluesky.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {games.map((g) => (
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

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthed={(id) => {
          setAuthOpen(false);
          const g = pending;
          setPending(null);
          if (g) {
            // re-run launch now that we're authed
            createRoom(g.type).then((room) => router.push(`/room/${room.id}`));
          }
        }}
      />
    </main>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-[#ffffff06] px-3 py-4 text-center">
      <div className="font-[var(--font-display)] text-xl font-semibold text-[var(--color-text-primary)]">
        {value}
      </div>
      <div className="mt-1 text-[11px] text-[var(--color-text-secondary)]">
        {label}
      </div>
    </div>
  );
}

const ORBIT_ACCENT: Record<string, string> = {
  geoguess: "var(--color-primary)",
  color_clash: "var(--color-warm)",
  flag_rush: "var(--color-success)",
  outline_quiz: "var(--color-cyan)",
  word_duel: "var(--color-gold)",
  reaction_grid: "var(--color-primary)",
};

// Live, clickable orbit. Each game sits evenly around the ring and launches a
// room on tap — so you can start any game from the top without scrolling. The
// labels counter-rotate against a slowly spinning ring so they stay upright.
function HubPortal({
  games,
  onPlay,
}: {
  games: GameInfo[];
  onPlay: (g: GameInfo) => void;
}) {
  const launchRandom = () => {
    if (games.length) onPlay(games[Math.floor(Math.random() * games.length)]);
  };

  return (
    <div className="portal-shadow relative h-full w-full">
      <motion.div
        className="absolute inset-[10%] rounded-full border border-[var(--color-border)]"
        animate={{ rotate: 360 }}
        transition={{ duration: 38, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute inset-[18%] rounded-full border border-dashed border-[var(--color-primary)]/70"
        animate={{ rotate: -360 }}
        transition={{ duration: 26, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute inset-[27%] rounded-full bg-[radial-gradient(circle,var(--color-primary-glow),transparent_68%)]"
        animate={{ scale: [1, 1.08, 1], opacity: [0.74, 1, 0.74] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-[34%] rounded-full border border-[var(--color-cyan)]/50 bg-[radial-gradient(circle_at_50%_42%,#67e8f93d,#8b7cff20_45%,transparent_72%)] shadow-[inset_0_0_34px_#67e8f926,0_0_60px_var(--color-primary-glow)]" />

      {/* Center: tap for a random duel */}
      <motion.button
        onClick={launchRandom}
        whileTap={{ scale: 0.94 }}
        title="Play a random game"
        className="absolute left-1/2 top-1/2 z-20 grid h-28 w-28 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#05060acc] active:bg-[#05060a]"
      >
        <div className="text-center">
          <div className="font-[var(--font-display)] text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-text-primary)]">
            enter
          </div>
          <div className="mt-0.5 font-[var(--font-mono)] text-[9px] uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
            random
          </div>
        </div>
      </motion.button>

      {/* Orbiting game nodes — evenly placed on the ring, each launches a room.
          Static positions (reliable taps) with a gentle bob for life. */}
      {games.map((g, i) => {
        const rad = (i / Math.max(1, games.length)) * 2 * Math.PI - Math.PI / 2;
        const R = 43; // % radius from center
        const x = 50 + R * Math.cos(rad);
        const y = 50 + R * Math.sin(rad);
        const accent = ORBIT_ACCENT[g.type] ?? "var(--color-primary)";
        return (
          <div
            key={g.type}
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <motion.button
              onClick={() => onPlay(g)}
              whileTap={{ scale: 0.92 }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1, y: [0, -4, 0] }}
              transition={{
                opacity: { delay: 0.2 + i * 0.05 },
                scale: { delay: 0.2 + i * 0.05 },
                y: { duration: 3.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.35 },
              }}
              className="whitespace-nowrap rounded-full border bg-[var(--color-surface)]/90 px-3 py-2 font-[var(--font-mono)] text-[11px] text-[var(--color-text-primary)] shadow-[0_4px_18px_rgba(0,0,0,0.4)] backdrop-blur-sm transition-colors active:bg-[var(--color-elevated)]"
              style={{ borderColor: `color-mix(in srgb, ${accent} 55%, transparent)` }}
            >
              <span
                className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
              />
              {g.name}
            </motion.button>
          </div>
        );
      })}
    </div>
  );
}
