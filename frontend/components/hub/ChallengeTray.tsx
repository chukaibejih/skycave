"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { createRoom, createSeries } from "@/lib/api";
import { AuthModal } from "@/components/ui/AuthModal";
import { useAuth } from "@/lib/store";
import { GameGlyph } from "@/components/games/gameVisual";

export const ELIGIBLE_SERIES_GAMES = [
  { type: "freeze", name: "Freeze", code: "FRZ", accent: "#67e8f9" },
  { type: "flag_rush", name: "Flag Rush", code: "FLG", accent: "#4ade80" },
  { type: "reaction_grid", name: "Reaction Grid", code: "RXN", accent: "#8b7cff" },
  { type: "color_clash", name: "Color Clash", code: "CLR", accent: "#ff9f0a" },
  { type: "mad_math", name: "Mad Math", code: "MTH", accent: "#ffe45c" },
  { type: "word_duel", name: "Word Duel", code: "WRD", accent: "#ffe45c" },
  { type: "word_hunt", name: "Word Hunt", code: "HNT", accent: "#67e8f9" },
  { type: "outline_quiz", name: "Outline Quiz", code: "OUT", accent: "#67e8f9" },
  { type: "geoguess", name: "GeoGuess", code: "GEO", accent: "#8b7cff" },
  { type: "connect4", name: "Connect 4", code: "C4", accent: "#ffe45c" },
  { type: "mancala", name: "Mancala", code: "MNC", accent: "#ffe45c" },
  { type: "dots_boxes", name: "Dots & Boxes", code: "D&B", accent: "#67e8f9" },
  { type: "tile_takeover", name: "Tile Takeover", code: "TKO", accent: "#4ade80" },
  { type: "uno", name: "Uno", code: "UNO", accent: "#8b7cff" },
  { type: "clay", name: "Clay", code: "CLY", accent: "#ff9f0a" },
];

type TrayView = "menu" | "1v1-picker" | "series-config";

interface ChallengeTrayProps {
  open: boolean;
  onClose: () => void;
}

export function ChallengeTray({ open, onClose }: ChallengeTrayProps) {
  const router = useRouter();
  const { identity } = useAuth();
  const [view, setView] = useState<TrayView>("menu");

  // Series config state
  const [seriesFormat, setSeriesFormat] = useState<3 | 5>(3);
  const [selectionMode, setSelectionMode] = useState<"random" | "custom">("random");
  const [pickedGames, setPickedGames] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);

  const resetState = () => {
    setView("menu");
    setSeriesFormat(3);
    setSelectionMode("random");
    setPickedGames([]);
    setCreating(false);
  };

  const handleClose = () => {
    onClose();
    setTimeout(resetState, 300);
  };

  // A challenge is fine for guests, but it still needs an identity to create the
  // room/series. Gate here and resume the exact action once signed in.
  const gate = (action: () => void): boolean => {
    if (identity) return true;
    setPending(() => action);
    setAuthOpen(true);
    return false;
  };

  // Launch 1v1 room directly
  const launch1v1 = async (gameType: string) => {
    if (!gate(() => launch1v1(gameType))) return;
    setCreating(true);
    try {
      const room = await createRoom(gameType);
      handleClose();
      router.push(`/room/${room.id}`);
    } catch {
      setCreating(false);
    }
  };

  // Create a real series: random draw (backend picks) or the creator's lineup.
  const handleCreateSeries = async () => {
    if (!gate(handleCreateSeries)) return;
    setCreating(true);
    try {
      const format = seriesFormat === 5 ? "bo5" : "bo3";
      const games =
        selectionMode === "custom" && pickedGames.length === seriesFormat
          ? pickedGames
          : undefined;
      const s = await createSeries(format, games);
      handleClose();
      router.push(`/series/${s.id}`);
    } catch {
      setCreating(false);
    }
  };

  const togglePickGame = (gameType: string) => {
    if (pickedGames.includes(gameType)) {
      setPickedGames(pickedGames.filter((g) => g !== gameType));
    } else {
      if (pickedGames.length < seriesFormat) {
        setPickedGames([...pickedGames, gameType]);
      }
    }
  };

  return (
    <>
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-5"
          onClick={handleClose}
        >
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-t-[28px] border border-[var(--color-border)] bg-[var(--color-elevated)] p-6 pb-[max(env(safe-area-inset-bottom),24px)] shadow-2xl sm:rounded-[28px]"
          >
            {/* Header bar */}
            <div className="mb-5 flex items-center justify-between">
              {view !== "menu" ? (
                <button
                  onClick={() => setView("menu")}
                  className="flex items-center gap-1.5 font-[var(--font-mono)] text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] hover:text-white"
                >
                  ‹ Back
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--color-primary)]/20 border border-[var(--color-primary)]/40 text-[var(--color-primary)]">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
                      <path d="M13 19l6-6" />
                      <path d="M16 16l4 4" />
                      <path d="M19 21l2-2" />
                      <path d="M9.5 17.5L21 6V3h-3L6.5 14.5" />
                      <path d="M11 19l-6-6" />
                      <path d="M8 16l-4 4" />
                      <path d="M5 21l-2-2" />
                    </svg>
                  </div>
                  <span className="font-[var(--font-mono)] text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                    Challenge Hub
                  </span>
                </div>
              )}
              <button
                onClick={handleClose}
                className="grid h-8 w-8 place-items-center rounded-full border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:border-white hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Menu View */}
            {view === "menu" && (
              <div className="space-y-3">
                <h2 className="font-[var(--font-display)] text-2xl font-bold tracking-tight text-white">
                  Pick a Challenge Mode
                </h2>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  Start an instant 1v1 match or set up a multi-game series duel.
                </p>

                <div className="grid gap-3 pt-2">
                  {/* Option 1: 1v1 */}
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setView("1v1-picker")}
                    className="group relative flex items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition-all hover:border-[var(--color-primary)] hover:shadow-[0_0_20px_var(--color-primary-glow)]"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-400">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
                          <path d="M13 19l6-6" />
                          <path d="M16 16l4 4" />
                          <path d="M19 21l2-2" />
                          <path d="M9.5 17.5L21 6V3h-3L6.5 14.5" />
                          <path d="M11 19l-6-6" />
                          <path d="M8 16l-4 4" />
                          <path d="M5 21l-2-2" />
                        </svg>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-[var(--font-display)] text-base font-bold text-white">
                            1v1 Duel
                          </h3>
                          <span className="rounded-full bg-cyan-400/10 border border-cyan-400/30 px-2 py-0.5 font-[var(--font-mono)] text-[10px] font-bold uppercase text-cyan-300">
                            Instant
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                          One game, head to head. Pick a game and share the link.
                        </p>
                      </div>
                    </div>
                    <span className="text-lg text-[var(--color-text-secondary)] group-hover:text-white">
                      ›
                    </span>
                  </motion.button>

                  {/* Option 2: Series */}
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setView("series-config")}
                    className="group relative flex items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition-all hover:border-[var(--color-gold)] hover:shadow-[0_0_20px_rgba(255,228,92,0.2)]"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--color-gold)]/30 bg-[var(--color-gold)]/10 text-[var(--color-gold)]">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                          <path d="M4 22h16" />
                          <path d="M10 14.66V17c0 .55-.45 1-1 1H7" />
                          <path d="M14 14.66V17c0 .55.45 1 1 1h2" />
                          <path d="M18 4H6v7a6 6 0 0 0 12 0V4z" />
                        </svg>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-[var(--font-display)] text-base font-bold text-white">
                            Series Duel
                          </h3>
                          <span className="rounded-full bg-[var(--color-gold)]/10 border border-[var(--color-gold)]/30 px-2 py-0.5 font-[var(--font-mono)] text-[10px] font-bold uppercase text-[var(--color-gold)]">
                            Bo3 / Bo5
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                          Best of 3 or 5 across games. Alternating hosts.
                        </p>
                      </div>
                    </div>
                    <span className="text-lg text-[var(--color-text-secondary)] group-hover:text-white">
                      ›
                    </span>
                  </motion.button>

                  {/* Option 3: Custom Tournament (Disabled preview with "soon" chip) */}
                  <div className="relative flex items-center justify-between rounded-2xl border border-[var(--color-border)]/50 bg-[var(--color-surface)]/40 p-4 text-left opacity-60">
                    <div className="flex items-center gap-3.5">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-[var(--color-text-secondary)]">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="3" width="20" height="14" rx="2" />
                          <line x1="8" y1="21" x2="16" y2="21" />
                          <line x1="12" y1="17" x2="12" y2="21" />
                        </svg>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-[var(--font-display)] text-base font-bold text-[var(--color-text-secondary)]">
                            Custom Tournament
                          </h3>
                          <span className="rounded-full border border-white/20 bg-white/5 px-2 py-0.5 font-[var(--font-mono)] text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                            soon
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                          Group bracket tournaments and custom prize pools.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 1v1 Game Picker */}
            {view === "1v1-picker" && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-[var(--font-display)] text-xl font-bold text-white">
                    Select a 1v1 Game
                  </h2>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Pick a game to create an instant 1v1 duel room.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2.5 max-h-[340px] overflow-y-auto pr-1 scrollbar-thin">
                  {ELIGIBLE_SERIES_GAMES.map((g) => (
                    <motion.button
                      key={g.type}
                      whileTap={{ scale: 0.94 }}
                      onClick={() => launch1v1(g.type)}
                      disabled={creating}
                      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-center transition-all hover:border-[var(--color-primary)] active:scale-95 disabled:opacity-50"
                    >
                      <div
                        className="grid h-10 w-10 place-items-center rounded-xl border"
                        style={{
                          background: `${g.accent}18`,
                          borderColor: `${g.accent}4d`,
                        }}
                      >
                        <GameGlyph type={g.type} color={g.accent} />
                      </div>
                      <span className="font-[var(--font-display)] text-xs font-bold text-white truncate w-full">
                        {g.name}
                      </span>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* Series Configurator */}
            {view === "series-config" && (
              <div className="space-y-5">
                <div>
                  <h2 className="font-[var(--font-display)] text-xl font-bold text-white">
                    Create a Series
                  </h2>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Compete in a multi-game duel with alternating host legs.
                  </p>
                </div>

                {/* Step 1: Format Selector */}
                <div className="space-y-1.5">
                  <label className="font-[var(--font-mono)] text-[11px] uppercase tracking-wider text-[var(--color-text-secondary)]">
                    1. Series Format
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[3, 5].map((fmt) => (
                      <button
                        key={fmt}
                        onClick={() => {
                          setSeriesFormat(fmt as 3 | 5);
                          setPickedGames([]);
                        }}
                        className={`flex h-11 items-center justify-center rounded-xl border font-[var(--font-display)] text-sm font-bold transition-all ${
                          seriesFormat === fmt
                            ? "border-[var(--color-gold)] bg-[var(--color-gold)]/20 text-[var(--color-gold)] shadow-[0_0_15px_rgba(255,228,92,0.2)]"
                            : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:text-white"
                        }`}
                      >
                        Best of {fmt} (Bo{fmt})
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step 2: Game Pool Mode */}
                <div className="space-y-1.5">
                  <label className="font-[var(--font-mono)] text-[11px] uppercase tracking-wider text-[var(--color-text-secondary)]">
                    2. Game Lineup Selection
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        setSelectionMode("random");
                        setPickedGames([]);
                      }}
                      className={`flex h-11 items-center justify-center gap-2 rounded-xl border font-[var(--font-display)] text-xs font-bold transition-all ${
                        selectionMode === "random"
                          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/20 text-white shadow-[0_0_15px_var(--color-primary-glow)]"
                          : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:text-white"
                      }`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 3 21 3 21 8" />
                        <line x1="4" y1="20" x2="21" y2="3" />
                        <polyline points="21 16 21 21 16 21" />
                        <line x1="15" y1="15" x2="21" y2="21" />
                        <line x1="4" y1="4" x2="9" y2="9" />
                      </svg>
                      <span>Random Games</span>
                    </button>
                    <button
                      onClick={() => setSelectionMode("custom")}
                      className={`flex h-11 items-center justify-center gap-2 rounded-xl border font-[var(--font-display)] text-xs font-bold transition-all ${
                        selectionMode === "custom"
                          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/20 text-white shadow-[0_0_15px_var(--color-primary-glow)]"
                          : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:text-white"
                      }`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <circle cx="12" cy="12" r="6" />
                        <circle cx="12" cy="12" r="2" />
                      </svg>
                      <span>Pick Yourself</span>
                    </button>
                  </div>
                </div>

                {/* Custom Pick Grid (Structured 3-column grid) */}
                {selectionMode === "custom" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                        Tap games in play order ({pickedGames.length}/{seriesFormat}):
                      </span>
                      {pickedGames.length > 0 && (
                        <button
                          onClick={() => setPickedGames([])}
                          className="text-[11px] text-[var(--color-warm)] hover:underline font-medium"
                        >
                          Clear selection
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
                      {ELIGIBLE_SERIES_GAMES.map((g) => {
                        const orderIdx = pickedGames.indexOf(g.type);
                        const isPicked = orderIdx !== -1;
                        return (
                          <button
                            key={g.type}
                            onClick={() => togglePickGame(g.type)}
                            className={`relative flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all ${
                              isPicked
                                ? "border-[var(--color-gold)] bg-[var(--color-gold)]/20 shadow-[0_0_12px_rgba(255,228,92,0.2)]"
                                : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-white/40"
                            }`}
                          >
                            {isPicked && (
                              <span className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full bg-[var(--color-gold)] font-[var(--font-mono)] text-[10px] font-bold text-black shadow-md">
                                {orderIdx + 1}
                              </span>
                            )}
                            <div
                              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border"
                              style={{
                                background: `${g.accent}18`,
                                borderColor: `${g.accent}4d`,
                              }}
                            >
                              <GameGlyph type={g.type} color={g.accent} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-[var(--font-display)] text-xs font-bold text-white truncate">
                                {g.name}
                              </div>
                              <div className="font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)] uppercase">
                                {g.code}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Create CTA Button */}
                <button
                  onClick={handleCreateSeries}
                  disabled={
                    creating ||
                    (selectionMode === "custom" && pickedGames.length < seriesFormat)
                  }
                  className="w-full h-12 rounded-2xl bg-[var(--color-primary)] font-[var(--font-display)] text-base font-bold text-white shadow-[0_4px_20px_var(--color-primary-glow)] transition-all hover:bg-[#7b6bf5] active:scale-98 disabled:opacity-40"
                >
                  {creating
                    ? "Creating Series…"
                    : selectionMode === "custom" && pickedGames.length < seriesFormat
                    ? `Pick ${seriesFormat - pickedGames.length} more game${
                        seriesFormat - pickedGames.length > 1 ? "s" : ""
                      }`
                    : `Create Best of ${seriesFormat} Series`}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        title="Sign in to challenge someone"
        onAuthed={() => {
          setAuthOpen(false);
          const p = pending;
          setPending(null);
          p?.();
        }}
      />
    </>
  );
}
