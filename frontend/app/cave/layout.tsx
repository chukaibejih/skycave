"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { CaveShell } from "@/components/cave/CaveShell";
import { CAVE_LAUNCH_LABEL, CAVE_PREVIEW, CountdownRow, useCountdown } from "@/components/cave/launch";

/**
 * Launch gate for every /cave route. Until August 1 the whole section is locked
 * behind a countdown, so no user can reach the hub, a case, or a room by URL. The
 * team keeps access via CAVE_PREVIEW (the local-only dev flag).
 */
export default function CaveLayout({ children }: { children: ReactNode }) {
  const c = useCountdown();

  if (CAVE_PREVIEW || c.done) return <>{children}</>;
  if (!c.mounted) return null; // avoid flashing the gated content before the clock resolves

  return (
    <CaveShell back="/">
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.18em]" style={{ borderColor: "rgba(201,162,75,0.4)", color: "#e8c98a" }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#e8c98a" strokeWidth="2.4" aria-hidden>
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          opens {CAVE_LAUNCH_LABEL}
        </div>
        <h1 className="font-[var(--font-display)] text-4xl font-bold" style={{ color: "#f5efe2" }}>The Cave is sealed</h1>
        <p className="mt-3 font-[var(--font-display)] text-base font-semibold" style={{ color: "#e8dcc0" }}>
          You know who did it. They don&apos;t.
        </p>
        <p className="mt-2 max-w-md text-sm leading-6" style={{ color: "#b7ad97" }}>
          Build a mystery and split the clues between two strangers, or claim a case and solve one with a partner. It
          opens {CAVE_LAUNCH_LABEL}.
        </p>
        <div className="mt-7">
          <CountdownRow c={c} />
        </div>
        <Link href="/" className="mt-8 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.14em] underline underline-offset-4" style={{ color: "#8a8069" }}>
          back to the games
        </Link>
      </div>
    </CaveShell>
  );
}
