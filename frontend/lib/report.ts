import { API, getToken } from "./api";

const CHUNK_HEAL_KEY = "sc-chunk-heal";
const CHUNK_HEAL_COOLDOWN = 10_000;

/**
 * A chunk that 404s is almost always a stale tab: the browser is holding HTML
 * from the previous deploy and asking for JS the new one no longer serves. The
 * cure is a hard reload onto the current build.
 *
 * Returns true if a reload was started (the caller should not bother reporting,
 * since this heals itself and would otherwise flood the feedback table after
 * every deploy). A second failure inside the cooldown means the reload did NOT
 * fix it, so we stop looping and let it be reported as a real bug.
 */
export function recoverFromChunkError(error: unknown): boolean {
  const e = error as { message?: string; name?: string };
  const text = `${e?.name ?? ""} ${e?.message ?? ""}`;
  const isChunk =
    /ChunkLoadError|Loading chunk \S+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
      text
    );
  if (!isChunk || typeof window === "undefined") return false;
  try {
    const last = Number(sessionStorage.getItem(CHUNK_HEAL_KEY) ?? 0);
    if (Date.now() - last < CHUNK_HEAL_COOLDOWN) return false;
    sessionStorage.setItem(CHUNK_HEAL_KEY, String(Date.now()));
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

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
