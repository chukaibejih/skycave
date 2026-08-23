"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AuthModal } from "@/components/ui/AuthModal";
import { createSeries, listGames } from "@/lib/api";
import { useAuth } from "@/lib/store";
import type { GameInfo } from "@/lib/types";

const GAMES_CACHE = "skycave_games_v2"; // shared with the hub's catalog cache

/**
 * The one way to start a head-to-head series from the hub. A floating action
 * button, like Bluesky's compose, carrying crossed swords so it reads as
 * "challenge someone" and never gets mistaken for a game tile. Tapping it opens
 * a small sheet to pick the length, then mints a series and drops the creator on
 * its page with a link to share.
 *
 * Self-contained: it owns its own auth prompt (a series is fine for guests), so
 * the hub only has to render it.
 */
export function CreateSeriesFab() {
  const router = useRouter();
  const { identity } = useAuth();
  const [open, setOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [format, setFormat] = useState<"bo3" | "bo5">("bo3");
  const [pick, setPick] = useState<"random" | "choose">("random");
  const [picked, setPicked] = useState<string[]>([]);
  const [games, setGames] = useState<GameInfo[]>([]);
  const [busy, setBusy] = useState(false);

  const need = format === "bo5" ? 5 : 3;

  // Deep-link: landing on /?new=series (e.g. "Start another series" from a
  // finished series) opens the sheet straight away, then cleans the URL so a
  // refresh does not reopen it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "series") {
      setOpen(true);
      params.delete("new");
      const qs = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  // The pool = the versus-capable catalog (same set the backend draws from).
  // Read the hub's cache first for an instant list, then revalidate.
  useEffect(() => {
    try {
      const cached = localStorage.getItem(GAMES_CACHE);
      if (cached) setGames((JSON.parse(cached) as GameInfo[]).filter((g) => g.versus_enabled !== false));
    } catch {
      /* ignore */
    }
    listGames()
      .then((g) => setGames(g.filter((x) => x.versus_enabled !== false)))
      .catch(() => {});
  }, []);

  // Switching to a shorter format drops extra picks so the count stays valid.
  useEffect(() => {
    setPicked((cur) => (cur.length > need ? cur.slice(0, need) : cur));
  }, [need]);

  const toggle = (type: string) => {
    setPicked((cur) => {
      if (cur.includes(type)) return cur.filter((t) => t !== type);
      if (cur.length >= need) return cur; // at the limit; drop one first
      return [...cur, type];
    });
  };

  const chooseIncomplete = pick === "choose" && picked.length !== need;

  const create = async () => {
    if (!identity) {
      setAuthOpen(true);
      return;
    }
    if (chooseIncomplete) return;
    setBusy(true);
    try {
      const s = await createSeries(format, pick === "choose" ? picked : undefined);
      router.push(`/series/${s.id}`);
    } catch {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Right-edge aligned with the global Feedback pill (right-3) and lifted
          to sit directly above it, so the two floating actions read as one
          deliberate stack instead of colliding. The bright gradient circle
          carries the primary weight; Feedback stays a muted pill below it. */}
      <motion.button
        onClick={() => setOpen(true)}
        aria-label="Start a series"
        title="Start a series"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 22, delay: 0.4 }}
        whileTap={{ scale: 0.92 }}
        className="fixed right-3 z-40 grid h-14 w-14 place-items-center rounded-full bottom-[calc(max(env(safe-area-inset-bottom),14px)_+_56px)]"
        style={{
          background: "linear-gradient(140deg, var(--color-primary), var(--color-cyan))",
          boxShadow: "0 10px 34px var(--color-primary-glow), 0 2px 10px rgba(0,0,0,0.4)",
          color: "#05060a",
        }}
      >
        <SwordsIcon />
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !busy && setOpen(false)}
            />
            <motion.div
              className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md px-4 pt-4 pb-[max(env(safe-area-inset-bottom),16px)]"
              initial={{ y: "110%" }}
              animate={{ y: 0 }}
              exit={{ y: "110%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <div
                className="rounded-[22px] border p-5"
                style={{
                  borderColor: "var(--color-border)",
                  background: "var(--color-surface)",
                  boxShadow: "0 -10px 60px rgba(0,0,0,0.5)",
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
                    style={{
                      background: "color-mix(in srgb, var(--color-primary) 16%, transparent)",
                      color: "var(--color-primary)",
                    }}
                  >
                    <SwordsIcon />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-[var(--font-display)] text-lg font-bold leading-tight">
                      Start a series
                    </h2>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      Challenge one person across a run of random games.
                    </p>
                  </div>
                </div>

                {/* Length. Two big, obvious targets rather than a hidden toggle. */}
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <FormatCard
                    label="Best of 3"
                    sub="First to 2 wins"
                    active={format === "bo3"}
                    onClick={() => setFormat("bo3")}
                  />
                  <FormatCard
                    label="Best of 5"
                    sub="First to 3 wins"
                    active={format === "bo5"}
                    onClick={() => setFormat("bo5")}
                  />
                </div>

                {/* Games: leave it to chance, or pick the exact lineup + order. */}
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
                    Games
                  </span>
                  <div
                    className="flex rounded-full border p-0.5"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <Seg label="Random" active={pick === "random"} onClick={() => setPick("random")} />
                    <Seg label="Pick" active={pick === "choose"} onClick={() => setPick("choose")} />
                  </div>
                </div>

                <AnimatePresence initial={false}>
                  {pick === "choose" && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <p className="mt-3 text-xs text-[var(--color-text-secondary)]">
                        Tap {need} games in the order you want to play them
                        <span style={{ color: picked.length === need ? "var(--color-success)" : "var(--color-primary)" }}>
                          {" "}· {picked.length}/{need}
                        </span>
                      </p>
                      <div className="mt-2.5 flex max-h-[184px] flex-wrap gap-2 overflow-y-auto py-1">
                        {games.map((g) => {
                          const idx = picked.indexOf(g.type);
                          const on = idx !== -1;
                          const atLimit = picked.length >= need && !on;
                          return (
                            <button
                              key={g.type}
                              onClick={() => toggle(g.type)}
                              disabled={atLimit}
                              className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40"
                              style={{
                                borderColor: on ? "var(--color-primary)" : "var(--color-border)",
                                background: on
                                  ? "color-mix(in srgb, var(--color-primary) 16%, var(--color-surface))"
                                  : "var(--color-base)",
                                color: on ? "var(--color-primary)" : "var(--color-text-primary)",
                              }}
                            >
                              {on && (
                                <span className="grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold"
                                      style={{ background: "var(--color-primary)", color: "#05060a" }}>
                                  {idx + 1}
                                </span>
                              )}
                              {g.name}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  onClick={create}
                  disabled={busy || chooseIncomplete}
                  className="mt-5 flex h-[54px] w-full items-center justify-center rounded-[16px] text-base font-bold transition-[filter] active:brightness-95 disabled:opacity-70"
                  style={{
                    background: "linear-gradient(140deg, var(--color-primary), var(--color-cyan))",
                    color: "#05060a",
                  }}
                >
                  {busy
                    ? "Setting it up..."
                    : chooseIncomplete
                      ? `Pick ${need - picked.length} more`
                      : "Create & get a link"}
                </button>
                <p className="mt-3 text-center text-xs text-[var(--color-text-secondary)]">
                  You will get a link to send to your opponent.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        title="Sign in to start a series"
        onAuthed={() => {
          setAuthOpen(false);
          void create();
        }}
      />
    </>
  );
}

function Seg({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
      style={{
        background: active ? "var(--color-primary)" : "transparent",
        color: active ? "#05060a" : "var(--color-text-secondary)",
      }}
    >
      {label}
    </button>
  );
}

function FormatCard({
  label,
  sub,
  active,
  onClick,
}: {
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start rounded-[16px] border px-4 py-3.5 text-left transition-colors"
      style={{
        borderColor: active ? "var(--color-primary)" : "var(--color-border)",
        background: active
          ? "color-mix(in srgb, var(--color-primary) 12%, var(--color-surface))"
          : "var(--color-base)",
        // Native <button> does not inherit `color`; without this the label
        // falls back to the UA black and vanishes on the dark sheet.
        color: active ? "var(--color-primary)" : "var(--color-text-primary)",
      }}
    >
      <span className="font-[var(--font-display)] text-base font-bold">{label}</span>
      <span className="mt-0.5 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.1em] text-[var(--color-text-secondary)]">
        {sub}
      </span>
    </button>
  );
}

function SwordsIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
      <line x1="13" x2="19" y1="19" y2="13" />
      <line x1="16" x2="20" y1="16" y2="20" />
      <line x1="19" x2="21" y1="21" y2="19" />
      <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" />
      <line x1="5" x2="9" y1="14" y2="18" />
      <line x1="7" x2="4" y1="17" y2="20" />
      <line x1="3" x2="5" y1="19" y2="21" />
    </svg>
  );
}
