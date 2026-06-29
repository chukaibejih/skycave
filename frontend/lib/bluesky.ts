// Bluesky sharing + OAuth helpers.
//
// Sharing uses the public compose-intent URL scheme. OAuth is handled by the
// backend Node sidecar (api.skycave.space/oauth/*): we just redirect the browser
// to it, and on return the frontend calls POST /auth/bluesky/complete to trade
// the sidecar's session cookie for a Skycave token (see lib/api.ts).

const COMPOSE = "https://bsky.app/intent/compose";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
