"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Button } from "./Button";
import { guestLogin } from "@/lib/api";
import { startBlueskyLogin } from "@/lib/bluesky";
import { useAuth } from "@/lib/store";
import type { Identity } from "@/lib/types";

interface Props {
  open: boolean;
  onClose?: () => void;
  onAuthed?: (identity: Identity) => void;
  /** Headline shown above the choices (varies between hub and invite-join). */
  title?: string;
}

export function AuthModal({
  open,
  onClose,
  onAuthed,
  title = "Play as guest or log in",
}: Props) {
  const setIdentity = useAuth((s) => s.setIdentity);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = (identity: Identity) => {
    setIdentity(identity);
    onAuthed?.(identity);
  };

  const onGuest = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      finish(await guestLogin(name.trim()));
    } catch {
      setError("Couldn't start a guest session.");
    } finally {
      setBusy(false);
    }
  };

  const onBluesky = () => {
    // Hands off to the OAuth sidecar; the browser navigates away and returns to
    // /oauth, which finishes login. (Guest is the path for local testing until
    // the sidecar is deployed behind https.)
    setBusy(true);
    setError(null);
    startBlueskyLogin(handle.trim() || undefined);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-md rounded-t-[24px] border border-[var(--color-border)] bg-[var(--color-elevated)] p-6 pb-[max(env(safe-area-inset-bottom),24px)] sm:rounded-[24px]"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 font-[var(--font-display)] text-xl font-bold">
              {title}
            </h2>
            <p className="mb-5 text-sm text-[var(--color-text-secondary)]">
              No account needed. Pick a name and jump in.
            </p>

            {/* Guest */}
            <label className="mb-1.5 block text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
              Guest name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              placeholder="e.g. nova"
              className="mb-3 w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-base outline-none focus:border-[var(--color-primary)]"
              onKeyDown={(e) => e.key === "Enter" && onGuest()}
            />
            <Button full onClick={onGuest} disabled={busy || !name.trim()}>
              Play as guest
            </Button>

            <div className="my-4 flex items-center gap-3 text-xs text-[var(--color-text-secondary)]">
              <span className="h-px flex-1 bg-[var(--color-border)]" />
              or
              <span className="h-px flex-1 bg-[var(--color-border)]" />
            </div>

            {/* Bluesky */}
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="your.bsky.social (optional)"
              className="mb-3 w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 font-[var(--font-mono)] text-sm outline-none focus:border-[var(--color-primary)]"
            />
            <Button variant="secondary" full onClick={onBluesky} disabled={busy}>
              <span aria-hidden>🦋</span> Continue with Bluesky
            </Button>

            {error && (
              <p className="mt-3 text-center text-sm text-[var(--color-warm)]">
                {error}
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
