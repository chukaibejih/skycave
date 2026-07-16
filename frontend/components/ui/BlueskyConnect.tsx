"use client";
import { useState } from "react";
import { BlueskyLogo } from "./BlueskyLogo";
import { startBlueskyLogin } from "@/lib/bluesky";

/**
 * Handle-first Bluesky login. Collecting the handle is REQUIRED, not optional:
 * it lets the OAuth flow resolve the user's real PDS (bsky.social, Blacksky,
 * self-hosted, ...). Without it the sidecar can't know where the account lives,
 * so anyone who migrated off bsky.social could never log in.
 */
export function BlueskyConnect({
  beforeStart,
  autoFocus = false,
}: {
  /** Runs just before we navigate away (e.g. stash a returnTo). */
  beforeStart?: () => void;
  autoFocus?: boolean;
}) {
  const [handle, setHandle] = useState("");
  const go = () => {
    if (!handle.trim()) return;
    beforeStart?.();
    startBlueskyLogin(handle);
  };
  return (
    <div>
      <div className="flex gap-2">
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          placeholder="you.bsky.social"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          className="min-w-0 flex-1 rounded-[10px] border px-3 py-2.5 font-[var(--font-mono)] text-sm outline-none focus:border-[#1185FE]"
          style={{
            borderColor: "var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text-primary)",
          }}
        />
        <button
          onClick={go}
          disabled={!handle.trim()}
          className="flex shrink-0 items-center gap-1.5 rounded-[10px] px-4 text-sm font-semibold disabled:opacity-50"
          style={{ background: "#1185FE", color: "#ffffff" }}
        >
          <BlueskyLogo className="h-4 w-4" /> Connect
        </button>
      </div>
      <p className="mt-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>
        Use your full handle · e.g. name.bsky.social or name.blacksky.app
      </p>
    </div>
  );
}
