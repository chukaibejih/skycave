"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AuthModal } from "@/components/ui/AuthModal";
import { createRoom, createSeries, listGames } from "@/lib/api";
import { useAuth } from "@/lib/store";
import type { GameInfo } from "@/lib/types";

const GAMES_CACHE = "skycave_games_v2"; // shared with the hub's catalog cache

type Step = "type" | "series" | "1v1";

/**
 * The one way to challenge someone from the hub. A floating action button, like
 * Bluesky's compose, carrying crossed swords so it reads as "challenge someone."
 * Tapping it opens a tray of challenge types rather than assuming one:
 *
 *   1v1     - one game, head to head
 *   Series  - best of 3 or 5 across games
 *   Custom tournament - reserved for later
 *
 * Self-contained: it owns its own auth prompt (challenges are fine for guests),
 * the game catalog, and the per-type config, so the hub only has to render it.
 */
export function ChallengeFab() {
  const router = useRouter();
  const { identity } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("type");
  const [authOpen, setAuthOpen] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [format, setFormat] = useState<"bo3" | "bo5">("bo3");
  const [pick, setPick] = useState<"random" | "choose">("random");
  const [picked, setPicked] = useState<string[]>([]);
  const [games, setGames] = useState<GameInfo[]>([]);
  const [busy, setBusy] = useState(false);

  const need = format === "bo5" ? 5 : 3;

  // Deep-link: /?new=series (or ?new=challenge) opens the tray on load, then
  // cleans the URL so a refresh does not reopen it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const want = params.get("new");
    if (want === "series" || want === "challenge") {
      setOpen(true);
      setStep(want === "series" ? "series" : "type");
      params.delete("new");
      const qs = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  // The pool = the versus-capable catalog (same set the backend draws from).
  // Cache first for an instant list, then revalidate.
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

  useEffect(() => {
    setPicked((cur) => (cur.length > need ? cur.slice(0, need) : cur));
  }, [need]);

  const close = () => {
    if (busy) return;
    setOpen(false);
    // Reset to the tray for next time, after the exit animation.
    setTimeout(() => {
      setStep("type");
      setPick("random");
      setPicked([]);
      setFormat("bo3");
    }, 250);
  };

  // Auth gate that resumes the exact action once signed in.
  const gate = (action: () => void): boolean => {
    if (identity) return true;
    setPending(() => action);
    setAuthOpen(true);
    return false;
  };

  const toggle = (type: string) => {
    setPicked((cur) => {
      if (cur.includes(type)) return cur.filter((t) => t !== type);
      if (cur.length >= need) return cur;
      return [...cur, type];
    });
  };

  const chooseIncomplete = pick === "choose" && picked.length !== need;

  const createSeriesNow = async () => {
    if (!gate(createSeriesNow)) return;
    if (chooseIncomplete) return;
    setBusy(true);
    try {
      const s = await createSeries(format, pick === "choose" ? picked : undefined);
      router.push(`/series/${s.id}`);
    } catch {
      setBusy(false);
    }
  };

  const start1v1 = async (gameType: string) => {
    if (!gate(() => start1v1(gameType))) return;
    setBusy(true);
    try {
      const room = await createRoom(gameType, "versus");
      router.push(`/room/${room.id}`);
    } catch {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Right-edge aligned with the global Feedback pill and lifted to sit
          above it, so the two floating actions read as one deliberate stack.
          Skycave purple with a stroke, so it is on-brand and calm rather than a
          loud gradient. */}
      <motion.button
        onClick={() => setOpen(true)}
        aria-label="Challenge someone"
        title="Challenge someone"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 22, delay: 0.4 }}
        whileTap={{ scale: 0.92 }}
        className="fixed right-3 z-40 grid h-14 w-14 place-items-center rounded-full bottom-[calc(max(env(safe-area-inset-bottom),14px)_+_64px)]"
        style={{
          background: "var(--color-primary)",
          border: "1.5px solid color-mix(in srgb, #ffffff 32%, var(--color-primary))",
          boxShadow: "0 10px 30px var(--color-primary-glow), 0 2px 10px rgba(0,0,0,0.4)",
          color: "#ffffff",
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
              onClick={close}
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
                {/* Header: icon + title, with a back arrow once past the tray. */}
                <div className="flex items-center gap-3">
                  {step === "type" ? (
                    <div
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
                      style={{
                        background: "color-mix(in srgb, var(--color-primary) 18%, transparent)",
                        color: "var(--color-primary)",
                      }}
                    >
                      <SwordsIcon />
                    </div>
                  ) : (
                    <button
                      onClick={() => !busy && setStep("type")}
                      aria-label="Back"
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-full border"
                      style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M15 18l-6-6 6-6" />
                      </svg>
                    </button>
                  )}
                  <div className="min-w-0">
                    <h2 className="font-[var(--font-display)] text-lg font-bold leading-tight">
                      {step === "series" ? "New series" : step === "1v1" ? "Pick a game" : "Challenge someone"}
                    </h2>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      {step === "series"
                        ? "Best of 3 or 5, across games."
                        : step === "1v1"
                          ? "One game, head to head. You get a link to share."
                          : "Pick how you want to play."}
                    </p>
                  </div>
                </div>

                {/* Step: choose a challenge type. */}
                {step === "type" && (
                  <div className="mt-5 flex flex-col gap-2.5">
                    <TypeRow
                      title="1v1"
                      sub="One game, head to head."
                      icon={<SwordsIcon />}
                      onClick={() => setStep("1v1")}
                    />
                    <TypeRow
                      title="Series"
                      sub="Best of 3 or 5 across games."
                      icon={<StackIcon />}
                      onClick={() => setStep("series")}
                    />
                    <TypeRow
                      title="Custom tournament"
                      sub="Bring your own bracket."
                      icon={<TrophyIcon />}
                      soon
                    />
                  </div>
                )}

                {/* Step: 1v1 game grid. */}
                {step === "1v1" && (
                  <div className="mt-4 flex max-h-[300px] flex-wrap gap-2 overflow-y-auto py-1">
                    {games.map((g) => (
                      <button
                        key={g.type}
                        onClick={() => start1v1(g.type)}
                        disabled={busy}
                        className="rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
                        style={{
                          borderColor: "var(--color-border)",
                          background: "var(--color-base)",
                          color: "var(--color-text-primary)",
                        }}
                      >
                        {g.name}
                      </button>
                    ))}
                    {busy && (
                      <p className="mt-1 w-full text-center text-xs text-[var(--color-text-secondary)]">
                        Opening the room...
                      </p>
                    )}
                  </div>
                )}

                {/* Step: series config. */}
                {step === "series" && (
                  <>
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <FormatCard label="Best of 3" sub="First to 2 wins" active={format === "bo3"} onClick={() => setFormat("bo3")} />
                      <FormatCard label="Best of 5" sub="First to 3 wins" active={format === "bo5"} onClick={() => setFormat("bo5")} />
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
                        Games
                      </span>
                      <div className="flex rounded-full border p-0.5" style={{ borderColor: "var(--color-border)" }}>
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
                      onClick={createSeriesNow}
                      disabled={busy || chooseIncomplete}
                      className="mt-5 flex h-[54px] w-full items-center justify-center rounded-[16px] text-base font-bold transition-[filter] active:brightness-95 disabled:opacity-70"
                      style={{ background: "var(--color-primary)", color: "#ffffff" }}
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
                  </>
                )}
              </div>
            </motion.div>
          </>
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

function TypeRow({
  title,
  sub,
  icon,
  onClick,
  soon = false,
}: {
  title: string;
  sub: string;
  icon: React.ReactNode;
  onClick?: () => void;
  soon?: boolean;
}) {
  return (
    <button
      onClick={soon ? undefined : onClick}
      disabled={soon}
      className="flex items-center gap-3 rounded-[16px] border px-4 py-3.5 text-left transition-colors active:brightness-95 disabled:cursor-default"
      style={{
        borderColor: "var(--color-border)",
        background: "var(--color-base)",
        opacity: soon ? 0.55 : 1,
      }}
    >
      <div
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
        style={{
          background: "color-mix(in srgb, var(--color-primary) 16%, transparent)",
          color: "var(--color-primary)",
        }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-[var(--font-display)] text-base font-bold" style={{ color: "var(--color-text-primary)" }}>
            {title}
          </span>
          {soon && (
            <span className="rounded-full border px-2 py-0.5 font-[var(--font-mono)] text-[9px] uppercase tracking-[0.12em] text-[var(--color-text-secondary)]"
                  style={{ borderColor: "var(--color-border)" }}>
              soon
            </span>
          )}
        </div>
        <div className="truncate text-sm text-[var(--color-text-secondary)]">{sub}</div>
      </div>
      {!soon && (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 18l6-6-6-6" />
        </svg>
      )}
    </button>
  );
}

function Seg({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
      style={{
        background: active ? "var(--color-primary)" : "transparent",
        color: active ? "#ffffff" : "var(--color-text-secondary)",
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
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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

function StackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}
