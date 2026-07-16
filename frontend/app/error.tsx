"use client";
import { useEffect } from "react";
import Link from "next/link";
import { reportClientError } from "@/lib/report";

/**
 * Route-level error boundary. Catches a render/runtime error in any page subtree
 * (e.g. a transient null in the lobby -> game handoff) and shows a recoverable
 * screen instead of white-screening the whole app. Logs the real exception so we
 * can find the root cause from the back office.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, "error.tsx");
  }, [error]);

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 px-6 text-center">
      <div
        className="grid h-14 w-14 place-items-center rounded-full"
        style={{ background: "color-mix(in srgb, var(--color-warm) 16%, transparent)" }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--color-warm)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
      <div>
        <h1 className="font-[var(--font-display)] text-2xl font-bold">Something glitched.</h1>
        <p className="mt-2 max-w-sm text-sm text-[var(--color-text-secondary)]">
          That one is on us, not you. Give it another go.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="h-11 rounded-[12px] px-5 text-sm font-semibold"
          style={{ background: "var(--color-primary)", color: "#05060a" }}
        >
          Try again
        </button>
        <Link
          href="/"
          className="grid h-11 place-items-center rounded-[12px] border px-5 text-sm font-semibold"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
        >
          Back to hub
        </Link>
      </div>
    </main>
  );
}
