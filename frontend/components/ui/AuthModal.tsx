"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Button } from "./Button";
import { BlueskyLogo } from "./BlueskyLogo";
import { guestLogin } from "@/lib/api";
import { startBlueskyLogin } from "@/lib/bluesky";
import { isInAppBrowser } from "@/lib/inAppBrowser";
import { useAuth } from "@/lib/store";
import type { Identity } from "@/lib/types";

interface Props {
  open: boolean;
  onClose?: () => void;
  onAuthed?: (identity: Identity) => void;
  /** Headline shown above the choices (varies between hub and invite-join). */
  title?: string;
  /**
   * Present when someone arrived on an invite link. They were sent here by a
   * Bluesky user, so they very likely have an account of their own - the order
   * of the two options flips to match that.
   */
  invite?: { hostHandle?: string | null; gameName?: string | null } | null;
}

export function AuthModal({
  open,
  onClose,
  onAuthed,
  title = "Play as guest or log in",
  invite = null,
}: Props) {
  const setIdentity = useAuth((s) => s.setIdentity);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Resolved after mount: the check reads navigator, which does not exist while
  // rendering on the server.
  const [inApp, setInApp] = useState(false);

  useEffect(() => setInApp(isInAppBrowser()), []);

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
    // Requires a handle - hands off to the OAuth sidecar, which navigates away
    // and returns to /oauth to finish login.
    const h = handle.trim();
    if (!h) return;
    setBusy(true);
    setError(null);
    startBlueskyLogin(h);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard can be blocked; the address bar still has the URL */
    }
  };

  const blueskyBlock = (
    <div>
      <label className="mb-1.5 block text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
        Bluesky handle
      </label>
      <input
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        placeholder="you.bsky.social"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="mb-3 w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 font-[var(--font-mono)] text-sm outline-none focus:border-[#1185FE]"
        onKeyDown={(e) => e.key === "Enter" && onBluesky()}
      />
      <Button
        variant="secondary"
        full
        onClick={onBluesky}
        disabled={busy || !handle.trim()}
        className="active:brightness-95"
        style={{
          backgroundColor: "#1185FE",
          color: "#ffffff",
          borderColor: "#1185FE",
          boxShadow: "0 0 24px #1185fe55",
        }}
      >
        <BlueskyLogo className="h-5 w-5" /> Continue with Bluesky
      </Button>
      <p className="mt-2 text-center text-xs text-[var(--color-text-secondary)]">
        Keeps your scores, profile and record.
      </p>
    </div>
  );

  const guestBlock = (
    <div>
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
      <Button
        full
        variant={invite ? "secondary" : undefined}
        onClick={onGuest}
        disabled={busy || !name.trim()}
      >
        Play as guest
      </Button>
      {/* Said plainly, because it cannot be undone: guest sessions are never
          persisted, so a guest's games are gone the moment they are played. */}
      <p className="mt-2 text-center text-xs text-[var(--color-text-secondary)]">
        Guest games aren&apos;t saved to a profile.
      </p>
    </div>
  );

  const divider = (
    <div className="my-4 flex items-center gap-3 text-xs text-[var(--color-text-secondary)]">
      <span className="h-px flex-1 bg-[var(--color-border)]" />
      or
      <span className="h-px flex-1 bg-[var(--color-border)]" />
    </div>
  );

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
            {invite ? (
              <>
                <h2 className="font-[var(--font-display)] text-xl font-bold">
                  {invite.hostHandle ? `@${invite.hostHandle} invited you` : title}
                </h2>
                <p className="mb-5 mt-1 text-sm text-[var(--color-text-secondary)]">
                  {invite.gameName ? `${invite.gameName} · 1v1` : "Join the game"}
                </p>
              </>
            ) : (
              <>
                <h2 className="mb-1 font-[var(--font-display)] text-xl font-bold">{title}</h2>
                <p className="mb-5 text-sm text-[var(--color-text-secondary)]">
                  No account needed. Pick a name and jump in.
                </p>
              </>
            )}

            {/* An app's built-in browser has its own storage, so an existing
                Skycave session does not come with it. Offered as a suggestion,
                never a block, because the detection is a heuristic. */}
            {inApp && (
              <div
                className="mb-5 rounded-[12px] border p-3.5"
                style={{
                  borderColor: "color-mix(in srgb, var(--color-primary) 45%, transparent)",
                  background: "color-mix(in srgb, var(--color-primary) 10%, transparent)",
                }}
              >
                <p className="text-sm font-semibold">Already signed in to Skycave?</p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                  You&apos;re in an app&apos;s built-in browser, which can&apos;t see your
                  login. Open this page in your normal browser and you&apos;ll already be
                  signed in.
                </p>
                <button
                  onClick={copyLink}
                  className="mt-2.5 h-9 rounded-[9px] px-3 text-xs font-semibold"
                  style={{
                    background: copied
                      ? "color-mix(in srgb, var(--color-success) 18%, transparent)"
                      : "color-mix(in srgb, var(--color-primary) 18%, transparent)",
                    color: copied ? "var(--color-success)" : "var(--color-primary)",
                  }}
                >
                  {copied ? "Link copied" : "Copy link"}
                </button>
              </div>
            )}

            {/* Invited players were sent here from Bluesky, so that goes first.
                On the hub, where a first-time visitor lands, guest stays first
                so nothing blocks a quick game. */}
            {invite ? (
              <>
                {blueskyBlock}
                {divider}
                {guestBlock}
              </>
            ) : (
              <>
                {guestBlock}
                {divider}
                {blueskyBlock}
              </>
            )}

            {error && (
              <p className="mt-3 text-center text-sm text-[var(--color-warm)]">{error}</p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
