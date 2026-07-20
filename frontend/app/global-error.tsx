"use client";
import { useEffect } from "react";
import { recoverFromChunkError, reportClientError } from "@/lib/report";

/**
 * Last-resort boundary for errors in the root layout itself. It replaces the
 * whole document, so it renders its own <html>/<body> and uses inline styles
 * (the app's CSS variables are not guaranteed to be mounted here).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // A stale-deploy chunk 404 heals itself with a reload; only report it if
    // the reload already failed to fix it.
    if (recoverFromChunkError(error)) return;
    reportClientError(error, "global-error.tsx");
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          textAlign: "center",
          background: "#05060a",
          color: "#f5f7ff",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Something glitched.</h1>
        <p style={{ maxWidth: 320, fontSize: 14, color: "#9aa3ba", margin: 0 }}>
          Skycave hit an unexpected error. Reloading usually clears it.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={reset}
            style={{
              height: 44,
              padding: "0 20px",
              borderRadius: 12,
              border: "none",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              background: "#8b7cff",
              color: "#05060a",
            }}
          >
            Try again
          </button>
          <a
            href="/"
            style={{
              height: 44,
              display: "grid",
              placeItems: "center",
              padding: "0 20px",
              borderRadius: 12,
              border: "1px solid #283044",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              color: "#f5f7ff",
            }}
          >
            Back to hub
          </a>
        </div>
      </body>
    </html>
  );
}
