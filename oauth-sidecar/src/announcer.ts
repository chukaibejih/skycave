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

/**
 * Post an ordered thread as @skycave.space. The first post carries the hashtags
 * (via withTags) and becomes the thread root; each later post is a reply chained
 * to the previous one, and carries no hashtags. Returns the root post's AT URI.
 *
 * The first post gets the stale-session retry (safe: nothing is posted yet).
 * Once it lands, replies are best-effort: a failed reply is logged and skipped,
 * never thrown, so the drain marks the row sent and cannot repost the root,
 * which would duplicate the whole thread.
 */
export async function postThread(posts: string[]): Promise<string> {
  type Ref = { uri: string; cid: string };
  const write = async (text: string, reply?: { root: Ref; parent: Ref }) => {
    const a = await ensureAgent();
    const rt = new RichText({ text });
    await rt.detectFacets(a);
    return a.post({
      text: rt.text,
      facets: rt.facets,
      ...(reply ? { reply } : {}),
      createdAt: new Date().toISOString(),
    });
  };

  let first;
  try {
    first = await write(withTags(posts[0]));
  } catch (err) {
    agent = null; // stale session on the very first post; log in fresh, retry once
    first = await write(withTags(posts[0]));
  }

  const root = { uri: first.uri, cid: first.cid };
  let parent = root;
  for (let i = 1; i < posts.length; i++) {
    try {
      const rep = await write(posts[i], { root, parent });
      parent = { uri: rep.uri, cid: rep.cid };
    } catch (err) {
      console.error(`[announce] thread reply ${i} failed:`, err);
    }
  }
  return first.uri;
}
