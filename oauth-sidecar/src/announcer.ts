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
 * Fetch an image URL and upload it as a blob, returning an images embed. Returns
 * undefined on any failure so the post still goes out as text-only rather than
 * failing because the picture could not be attached.
 */
async function imageEmbed(
  a: AtpAgent,
  url: string,
  alt: string
): Promise<{ $type: string; [k: string]: unknown } | undefined> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`[announce] image fetch ${resp.status} for ${url}`);
      return undefined;
    }
    const bytes = new Uint8Array(await resp.arrayBuffer());
    // Bluesky rejects blobs over ~1MB; skip rather than fail the whole post.
    if (bytes.byteLength > 1_000_000) {
      console.error(`[announce] image too large (${bytes.byteLength}B), skipping`);
      return undefined;
    }
    const encoding = resp.headers.get("content-type") || "image/png";
    const up = await a.uploadBlob(bytes, { encoding });
    return {
      $type: "app.bsky.embed.images",
      images: [{ alt: alt.slice(0, 280) || "Skycave", image: up.data.blob }],
    };
  } catch (err) {
    console.error("[announce] image embed failed:", err);
    return undefined;
  }
}

/**
 * Post text as @skycave.space, resolving @mentions and links to facets, and
 * optionally attaching an image (fetched from `imageUrl` and uploaded as a blob).
 * Returns the created post's AT URI. Retries a login once if the cached session
 * has gone stale (app-password sessions expire).
 */
export async function postAnnouncement(
  text: string,
  imageUrl?: string
): Promise<string> {
  // The alt text is the first real line of the post - the headline - which
  // describes the card well enough for a screen reader.
  const alt = text.split("\n").map((l) => l.trim()).find(Boolean) || "Skycave";
  const attempt = async (): Promise<string> => {
    const a = await ensureAgent();
    const rt = new RichText({ text: withTags(text) });
    await rt.detectFacets(a); // resolves @handles -> DIDs, links + #tags -> facets
    const embed = imageUrl ? await imageEmbed(a, imageUrl, alt) : undefined;
    const res = await a.post({
      text: rt.text,
      facets: rt.facets,
      ...(embed ? { embed } : {}),
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
