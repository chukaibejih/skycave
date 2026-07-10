"use client";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Cave atmosphere wrapper. A warmer amber/sepia ambient glow, distinct from the
 * main hub's teal and violet, so you feel you stepped into a different room.
 */
export function CaveShell({
  children,
  back,
  backLabel = "back",
  maxWidth = "max-w-3xl",
}: {
  children: ReactNode;
  back?: string;
  backLabel?: string;
  maxWidth?: string;
}) {
  return (
    <main className="relative min-h-[100dvh] w-full">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(1200px 620px at 50% -12%, rgba(255,150,60,0.10), transparent 60%)," +
            "radial-gradient(900px 520px at 88% 12%, rgba(150,90,50,0.08), transparent 55%)," +
            "#0A0A0F",
        }}
      />
      <div className={`mx-auto w-full ${maxWidth} px-4 py-6 pb-24 sm:px-6`}>
        {back && (
          <Link
            href={back}
            className="mb-5 inline-flex items-center gap-1.5 text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
            {backLabel}
          </Link>
        )}
        {children}
      </div>
    </main>
  );
}

/** Persistent, quiet, italic contextual help. Never disappears. */
export function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1.5 text-[13px] italic leading-5" style={{ color: "#8888AA" }}>
      {children}
    </p>
  );
}
