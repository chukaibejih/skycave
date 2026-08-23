"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AuthModal } from "@/components/ui/AuthModal";
import { createSeries } from "@/lib/api";
import { useAuth } from "@/lib/store";

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
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!identity) {
      setAuthOpen(true);
      return;
    }
    setBusy(true);
    try {
      const s = await createSeries(format);
      router.push(`/series/${s.id}`);
    } catch {
      setBusy(false);
    }
  };

  return (
    <>
      {/* The button. Sits above the footer, clear of the thumb's home row. */}
      <motion.button
        onClick={() => setOpen(true)}
        aria-label="Start a series"
        title="Start a series"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 22, delay: 0.4 }}
        whileTap={{ scale: 0.92 }}
        className="fixed bottom-6 right-5 z-40 grid h-14 w-14 place-items-center rounded-full sm:bottom-8 sm:right-8"
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
              className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md p-4"
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

                <button
                  onClick={create}
                  disabled={busy}
                  className="mt-5 flex h-[54px] w-full items-center justify-center rounded-[16px] text-base font-bold transition-[filter] active:brightness-95 disabled:opacity-70"
                  style={{
                    background: "linear-gradient(140deg, var(--color-primary), var(--color-cyan))",
                    color: "#05060a",
                  }}
                >
                  {busy ? "Setting it up..." : "Create & get a link"}
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
          : "var(--color-bg)",
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
