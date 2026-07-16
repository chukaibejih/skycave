import { API, getToken } from "./api";

/**
 * Fire-and-forget client-error reporter. Posts the exception to the existing
 * /feedback endpoint tagged "[app-error]" so crashes land in the back office
 * (no new backend endpoint / droplet redeploy needed). Never throws — logging
 * must not cause a second failure inside an error boundary. `keepalive` lets it
 * survive an immediate navigation/reload.
 */
export function reportClientError(error: unknown, where: string): void {
  try {
    const e = error as { message?: string; stack?: string; digest?: string };
    const path =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "";
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const msg =
      `[app-error] ${e?.message ?? String(error)}\n` +
      (e?.digest ? `digest: ${e.digest}\n` : "") +
      `@ ${where} ${path}\n${ua}\n` +
      (e?.stack ? e.stack.slice(0, 1200) : "");
    if (typeof console !== "undefined") console.error("[app-error]", error);
    const token = getToken();
    fetch(`${API}/feedback`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message: msg.slice(0, 1800), page: path || where }),
    }).catch(() => {});
  } catch {
    /* logging must never throw */
  }
}
