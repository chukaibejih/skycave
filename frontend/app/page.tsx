"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { GameCard } from "@/components/ui/GameCard";
import { AuthModal } from "@/components/ui/AuthModal";
import { Avatar } from "@/components/ui/Avatar";
import { createRoom, listGames } from "@/lib/api";
import { gameSlug } from "@/lib/solo";
import { useAuth } from "@/lib/store";
import type { GameInfo } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const { identity, loaded, hydrate } = useAuth();
  const [games, setGames] = useState<GameInfo[]>([]);
  const [authOpen, setAuthOpen] = useState(false);
  // Game whose mode is being chosen, and the pending {game, mode} awaiting auth.
  const [chooser, setChooser] = useState<GameInfo | null>(null);
  const [pending, setPending] = useState<{ game: GameInfo; mode: "versus" | "solo" } | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    hydrate();
    listGames().then(setGames).catch(() => setGames([]));
  }, [hydrate]);

  const go = async (game: GameInfo, m: "versus" | "solo") => {
    if (m === "solo") {
      // Solo skips the lobby — the /play route creates the room + drops in.
      router.push(`/play/${gameSlug(game.type)}`);
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

  // Tapping any game opens the mode chooser (no hidden mode state).
  const launch = (game: GameInfo) => setChooser(game);

  const choose = async (game: GameInfo, m: "versus" | "solo") => {
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
            Fast games built for Bluesky. Play solo and post your score, or
            open a 1v1 room and let anyone tap in straight from the link.
          </p>
        </motion.div>

        <div className="flex flex-col items-center gap-4">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
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
            tap a game to play
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.7 }}
            className="relative mx-auto flex aspect-square w-full max-w-[300px] items-center justify-center sm:max-w-[440px] lg:max-w-[520px]"
          >
            <HubPortal games={games} onPlay={launch} />
          </motion.div>
        </div>
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

// Tap a game -> choose 1v1 or solo. No hidden mode; the choice is explicit.
function ModeChooser({
  game,
  onClose,
  onChoose,
}: {
  game: GameInfo | null;
  onClose: () => void;
  onChoose: (game: GameInfo, mode: "versus" | "solo") => void;
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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

// Decode the current rotation (degrees) from an element's computed transform —
// used to freeze the live CSS spin at its exact angle before parking.
function readAngle(el: HTMLElement): number {
  const t = getComputedStyle(el).transform;
  if (!t || t === "none") return 0;
  try {
    const m = new DOMMatrixReadOnly(t);
    return (Math.atan2(m.b, m.a) * 180) / Math.PI;
  } catch {
    return 0;
  }
}

const PARK_EASE = "transform 0.8s cubic-bezier(0.22, 1, 0.36, 1)";

// Live orbit. The ring spins forever via pure CSS (animation: hub-spin); each
// pill counter-spins so its label stays upright. Tapping a pill parks it at 3
// o'clock and lights up the center as "PLAY"; tapping center plays it.
// Positions are derived from the game count, so adding a game just works.
function HubPortal({
  games,
  onPlay,
}: {
  games: GameInfo[];
  onPlay: (g: GameInfo) => void;
}) {
  const ringRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<GameInfo | null>(null);
  const n = Math.max(1, games.length);

  // Base position of pill i around the ring (degrees, 0° = 3 o'clock).
  const angleDeg = (i: number) => (i / n) * 360 - 90;

  // Rotate the ring so pill `i` lands at 3 o'clock, freezing the live spin
  // first so the transition starts from the current angle (no jump).
  const park = (i: number) => {
    const ring = ringRef.current;
    if (!ring) return;
    const pills = Array.from(ring.querySelectorAll<HTMLElement>(".orbit-pill"));
    const cur = readAngle(ring);
    const delta = ((-angleDeg(i) - cur + 540) % 360) - 180; // shortest path
    const target = cur + delta;

    // Freeze at the current angle (kill the keyframe animation), no transition.
    for (const el of [ring, ...pills]) {
      el.style.transition = "none";
      el.style.animation = "none";
    }
    ring.style.transform = `rotate(${cur}deg)`;
    for (const p of pills) p.style.transform = `rotate(${-cur}deg)`;
    void ring.offsetWidth; // force reflow so the next change transitions

    // Glide to the parked angle; pills counter-rotate to stay upright.
    ring.style.transition = PARK_EASE;
    ring.style.transform = `rotate(${target}deg)`;
    for (const p of pills) {
      p.style.transition = PARK_EASE;
      p.style.transform = `rotate(${-target}deg)`;
    }
  };

  const pickPill = (g: GameInfo, i: number) => {
    park(i);
    setSelected(g);
  };

  const tapCenter = () => {
    if (selected) onPlay(selected);
    else if (games.length)
      onPlay(games[Math.floor(Math.random() * games.length)]);
  };

  const R = 43; // ring radius, % from center

  return (
    <div className="portal-shadow relative h-full w-full">
      {/* Static decorative core — never rotates. */}
      <div className="absolute inset-[10%] rounded-full border border-[var(--color-border)]" />
      <div className="absolute inset-[18%] rounded-full border border-dashed border-[var(--color-primary)]/40" />
      <motion.div
        className="absolute inset-[27%] rounded-full bg-[radial-gradient(circle,var(--color-primary-glow),transparent_68%)]"
        animate={{ scale: [1, 1.08, 1], opacity: [0.74, 1, 0.74] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-[34%] rounded-full border border-[var(--color-cyan)]/50 bg-[radial-gradient(circle_at_50%_42%,#67e8f93d,#8b7cff20_45%,transparent_72%)] shadow-[inset_0_0_34px_#67e8f926,0_0_60px_var(--color-primary-glow)]" />

      {/* Spinning ring + pills. Mounted together (only once games exist) so the
          ring and counter-spin animations start on the same frame and stay in
          perfect sync. */}
      {games.length > 0 && (
        <div ref={ringRef} className="orbit-ring absolute inset-0 z-10">
          {games.map((g, i) => {
            const a = (angleDeg(i) * Math.PI) / 180;
            const x = 50 + R * Math.cos(a);
            const y = 50 + R * Math.sin(a);
            const accent = ORBIT_ACCENT[g.type] ?? "var(--color-primary)";
            const isSel = selected?.type === g.type;
            return (
              <div
                key={g.type}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <button
                  onClick={() => pickPill(g, i)}
                  className="orbit-pill flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-[var(--color-surface)]/90 px-3 font-[var(--font-mono)] text-[11px] text-[var(--color-text-primary)] backdrop-blur-sm transition-colors active:bg-[var(--color-elevated)]"
                  style={{
                    borderColor: isSel
                      ? accent
                      : `color-mix(in srgb, ${accent} 55%, transparent)`,
                    boxShadow: isSel
                      ? `0 0 20px ${accent}, 0 4px 18px rgba(0,0,0,0.4)`
                      : "0 4px 18px rgba(0,0,0,0.4)",
                  }}
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
                  />
                  {g.name}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Fixed center — never rotates. Crossfades between ENTER/RANDOM and the
          selected game's PLAY state. */}
      <motion.button
        onClick={tapCenter}
        whileTap={{ scale: 0.94 }}
        title={selected ? `Play ${selected.name}` : "Play a random game"}
        className="absolute left-1/2 top-1/2 z-20 grid h-28 w-28 -translate-x-1/2 -translate-y-1/2 place-items-center overflow-hidden rounded-full bg-[#05060acc] px-3 text-center active:bg-[#05060a]"
      >
        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div
              key={selected.type}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.22 }}
            >
              <div className="font-[var(--font-display)] text-[13px] font-semibold leading-tight text-[var(--color-text-primary)]">
                {selected.name}
              </div>
              <div className="mt-1 font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-primary)]">
                play
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="random"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.22 }}
            >
              <div className="font-[var(--font-display)] text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-text-primary)]">
                enter
              </div>
              <div className="mt-0.5 font-[var(--font-mono)] text-[9px] uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
                random
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
