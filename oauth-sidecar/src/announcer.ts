import { AtpAgent, RichText } from "@atproto/api";

// The first-party @skycave.space account. Posting lives here (not in the Python
// backend) because @atproto/api carries the whole write path: app-password
// login, RichText.detectFacets (which turns @handles and links into real
// mention/link facets), and post creation. The backend only composes the text.
//
// The app password is an UNSCOPED full-account credential: it is read from the
// environment on the server, never committed, never sent to the client.
const SERVICE = process.env.SKYCAVE_BSKY_SERVICE || "https://bsky.social";
const HANDLE = process.env.SKYCAVE_BSKY_HANDLE || "";
const APP_PASSWORD = process.env.SKYCAVE_BSKY_APP_PASSWORD || "";

export function announcerConfigured(): boolean {
  return Boolean(HANDLE && APP_PASSWORD);
}

// Every post from @skycave.space carries these, so the hub and the tournament
// all surface under the same community tags. RichText.detectFacets turns them
// into real hashtag facets. Added only when there is room under the 300
// grapheme ceiling, so a full post never fails to send because of the tags.
const TAGS = "#blacksky #blackskygamers";
function withTags(text: string): string {
  const full = `${text}\n\n${TAGS}`;
  // Array.from counts by code point (emoji = 1), close enough to graphemes and
  // conservative, so we never overshoot the real limit.
  return Array.from(full).length <= 300 ? full : text;
}

let agent: AtpAgent | null = null;

async function ensureAgent(): Promise<AtpAgent> {
  if (agent?.session) return agent;
  if (!announcerConfigured()) {
    throw new Error("announcer not configured (missing SKYCAVE_BSKY_* env)");
  }
  const a = new AtpAgent({ service: SERVICE });
  await a.login({ identifier: HANDLE, password: APP_PASSWORD });
  agent = a;
  return a;
}

/**
 * Post text as @skycave.space, resolving @mentions and links to facets.
 * Returns the created post's AT URI. Retries a login once if the cached session
 * has gone stale (app-password sessions expire).
 */
export async function postAnnouncement(text: string): Promise<string> {
  const attempt = async (): Promise<string> => {
    const a = await ensureAgent();
    const rt = new RichText({ text: withTags(text) });
    await rt.detectFacets(a); // resolves @handles -> DIDs, links + #tags -> facets
    const res = await a.post({
      text: rt.text,
      facets: rt.facets,
      createdAt: new Date().toISOString(),
    });
    return res.uri;
  };
  try {
    return await attempt();
  } catch (err) {
    // A stale session throws on post; drop it and log in fresh once.
    agent = null;
    return await attempt();
  }
}
