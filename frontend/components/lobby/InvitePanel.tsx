"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ShareButton } from "./ShareButton";
import { ChallengeFlow } from "./ChallengeFlow";
import { roomUrl, roomUrlDisplay } from "@/lib/site";

interface Props {
  roomCode: string;
  gameName: string;
  // Pre-composed post text from the API. Until it lands, the link row and the
  // native share sheet still work, so the screen is never a dead end.
  inviteText: string;
}

/**
 * Everything the host can do while waiting for an opponent, in one panel.
 *
 * The whole job of this screen is to get a second human into the room, so the
 * three ways out are ranked by how many people they can actually reach:
 *
 *   1. the link itself   — copy, or the OS share sheet (WhatsApp, iMessage, DM)
 *   2. Post to Bluesky   — one public post, anyone can tap in
 *   3. Invite someone    — @mention one specific person, so they get pinged
 *
 * The raw URL is shown, not hidden behind a button, so the user can see what
 * they are about to send and still read it out if the clipboard misbehaves.
 */
export function InvitePanel({ roomCode, gameName, inviteText }: Props) {
  const url = roomUrl(roomCode);
  const [copied, setCopied] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);
  // Resolved after mount: navigator.share does not exist during SSR, and
  // branching on it during render would desync hydration.
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (insecure origin, permissions). The URL is
      // select-all, so long-pressing it still works.
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({
        title: "Skycave",
        text: `come play me in ${gameName} on Skycave`,
        url,
      });
    } catch {
      /* dismissed */
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-center text-sm leading-snug text-[var(--color-text-secondary)]">
        Send this link to anyone. First person to open it takes the seat.
      </p>

      {/* The link, visible and copyable. */}
      <div className="flex items-center gap-1.5 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-1.5 pl-3">
        <span className="min-w-0 flex-1 select-all truncate font-[var(--font-mono)] text-sm text-[var(--color-text-secondary)]">
          {roomUrlDisplay(roomCode)}
        </span>

        {canNativeShare && (
          <button
            onClick={nativeShare}
            aria-label="Share link"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] text-[var(--color-text-secondary)] transition-[filter] active:brightness-95"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
              <path d="M12 15V3" />
              <path d="m8 7 4-4 4 4" />
            </svg>
          </button>
        )}

        <motion.button
          whileTap={{ scale: 0.96 }}
          transition={{ duration: 0.12 }}
          onClick={copy}
          className="h-9 shrink-0 rounded-[9px] px-3.5 text-sm font-semibold transition-colors"
          style={{
            background: copied
              ? "color-mix(in srgb, var(--color-success) 18%, transparent)"
              : "color-mix(in srgb, var(--color-primary) 18%, transparent)",
            color: copied ? "var(--color-success)" : "var(--color-primary)",
          }}
        >
          {copied ? "Copied" : "Copy"}
        </motion.button>
      </div>

      {inviteText && <ShareButton text={inviteText} label="Post to Bluesky" full />}

      {!challengeOpen && (
        <button
          onClick={() => setChallengeOpen(true)}
          style={{
            borderColor: "color-mix(in srgb, var(--color-primary) 55%, transparent)",
            color: "var(--color-text-primary)",
          }}
          className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[12px] border-2 text-base font-semibold transition-[filter] active:brightness-95"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M14.5 3.5 21 10l-9.5 9.5a2.1 2.1 0 0 1-3 0L3 14a2.1 2.1 0 0 1 0-3z" />
            <path d="M7 7h.01" />
          </svg>
          Invite someone specific
        </button>
      )}

      <ChallengeFlow
        roomCode={roomCode}
        gameName={gameName}
        open={challengeOpen}
        onOpenChange={setChallengeOpen}
      />
    </div>
  );
}
