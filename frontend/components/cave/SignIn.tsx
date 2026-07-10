"use client";
import { useState } from "react";
import { devLogin } from "@/lib/api";
import { startBlueskyLogin } from "@/lib/bluesky";
import { useAuth } from "@/lib/store";

const DEV = process.env.NEXT_PUBLIC_DEV_LOGIN === "true";
const INK = "var(--color-text-primary)";
const MUTED = "#8888AA";

/**
 * Cave sign-in. Bluesky OAuth is the real path; when NEXT_PUBLIC_DEV_LOGIN is set
 * a local dev handle sign-in is also shown so the Cave can be tested before the
 * OAuth sidecar deploys. `returnTo` is stashed so OAuth returns to this page.
 */
export function CaveSignIn({ returnTo }: { returnTo: string }) {
  const setIdentity = useAuth((s) => s.setIdentity);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dev = async () => {
    if (!handle.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      setIdentity(await devLogin(handle.trim()));
    } catch {
      setErr("Handle not found on Bluesky.");
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[16px] border p-6" style={{ borderColor: "var(--color-border)", background: "#12100d" }}>
      <p className="text-sm" style={{ color: INK }}>The Cave is played with your Bluesky identity. Solving is a two-person job.</p>
      <button
        onClick={() => {
          sessionStorage.setItem("cave_return", returnTo);
          startBlueskyLogin();
        }}
        className="mt-4 h-11 w-full rounded-[10px] text-sm font-semibold"
        style={{ background: "var(--color-primary)", color: "#05060a" }}
      >
        Connect Bluesky
      </button>
      {DEV && (
        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="mb-2 font-[var(--font-mono)] text-[11px] uppercase tracking-wide" style={{ color: MUTED }}>dev sign-in (local only)</div>
          <div className="flex gap-2">
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && dev()}
              placeholder="your.bsky.social"
              className="flex-1 rounded-[8px] border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--color-border)", background: "#13100c", color: INK }}
            />
            <button onClick={dev} disabled={busy} className="rounded-[8px] border px-4 text-sm" style={{ borderColor: "var(--color-border)", color: INK }}>
              {busy ? "..." : "Enter"}
            </button>
          </div>
          {err && <p className="mt-2 text-xs" style={{ color: "#ff725e" }}>{err}</p>}
        </div>
      )}
    </div>
  );
}
