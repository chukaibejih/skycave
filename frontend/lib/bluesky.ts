// Bluesky sharing + OAuth helpers.
//
// Sharing uses the public compose-intent URL scheme. OAuth is handled by the
// backend Node sidecar (api.skycave.space/oauth/*): we just redirect the browser
// to it, and on return the frontend calls POST /auth/bluesky/complete to trade
// the sidecar's session cookie for a Skycave token (see lib/api.ts).

const COMPOSE = "https://bsky.app/intent/compose";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Public AppView, no auth required. Used for handle typeahead + resolution in
// the "challenge someone" lobby flow.
const PUBLIC_API = "https://public.api.bsky.app/xrpc";

export interface BskyActor {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

const toActor = (a: {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}): BskyActor => ({
  did: a.did,
  handle: a.handle,
  displayName: a.displayName,
  avatar: a.avatar,
});

const stripAt = (h: string) => h.trim().replace(/^@+/, "");

/** Typeahead search for actors by partial handle/name. Returns [] on failure. */
export async function searchActors(
  q: string,
  signal?: AbortSignal
): Promise<BskyActor[]> {
  try {
    const url = `${PUBLIC_API}/app.bsky.actor.searchActorsTypeahead?q=${encodeURIComponent(
      stripAt(q)
    )}&limit=5`;
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { actors?: BskyActor[] };
    return (data.actors ?? []).map(toActor);
  } catch {
    return []; // aborted or offline; caller treats as "no results"
  }
}

/** Resolve a full handle to a real actor (DID). Returns null if it doesn't exist. */
export async function resolveActor(handle: string): Promise<BskyActor | null> {
  const clean = stripAt(handle);
  if (!clean) return null;
  try {
    const url = `${PUBLIC_API}/app.bsky.actor.getProfile?actor=${encodeURIComponent(
      clean
    )}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const a = (await res.json()) as BskyActor;
    return a?.did ? toActor(a) : null;
  } catch {
    return null;
  }
}

export function composeIntentUrl(text: string): string {
  return `${COMPOSE}?text=${encodeURIComponent(text)}`;
}

/** Open the Bluesky composer pre-filled with `text`. */
export function shareToBluesky(text: string): void {
  window.open(composeIntentUrl(text), "_blank", "noopener,noreferrer");
}

/**
 * Start AT Protocol OAuth by handing off to the sidecar. It runs PAR + the
 * DPoP-bound authorization-code flow, sets an httpOnly session cookie, and
 * redirects back to /oauth, where the app calls completeBluesky().
 */
export function startBlueskyLogin(handle?: string): void {
  const q = handle ? `?handle=${encodeURIComponent(handle)}` : "";
  window.location.href = `${API}/oauth/login${q}`;
}
