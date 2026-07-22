/**
 * Is this page running inside an app's built-in browser?
 *
 * It matters because those run in their own storage sandbox. Someone who is
 * logged in to Skycave in their real browser arrives here looking like a
 * stranger, and the sign-in screen used to quietly hand them a guest session -
 * which is unrecoverable, since guest games are never persisted.
 *
 * This is a heuristic and it will occasionally be wrong in both directions, so
 * callers must only ever use it to *offer* a suggestion, never to block or to
 * gate anything.
 *
 * Deliberately NOT flagged: iOS SFSafariViewController, which keeps the "Safari"
 * token and shares storage with Safari. Sessions survive there, so nudging
 * those users would be noise.
 */
export function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";

  // Apps that announce themselves outright.
  if (/\b(FBAN|FBAV|Instagram|Line|Twitter|TikTok|Snapchat|Pinterest|LinkedIn)\b/i.test(ua)) {
    return true;
  }
  // Android WebView marks itself with "; wv".
  if (/;\s*wv\)/i.test(ua)) return true;

  // iOS WKWebView: WebKit on an iOS device, but with no "Safari" token. Real
  // Safari and SFSafariViewController both carry it.
  const iOS = /\b(iPhone|iPad|iPod)\b/.test(ua);
  if (iOS && /AppleWebKit/i.test(ua) && !/Safari\//i.test(ua)) return true;

  return false;
}
