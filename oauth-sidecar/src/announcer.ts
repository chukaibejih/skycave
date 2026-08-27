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

// Skycave's own tag rides every post (in prep for Skycave's own feed). A post
// that does NOT tag a player also carries the Blacksky community tags for reach;
// a post that @-mentions a player skips them, so a tagged player never drags the
// whole community into their notifications (the Blacksky community's request).
// RichText.detectFacets turns all of these into real hashtag/mention facets.
const SKYCAVE = "#skycave";
// The 🎮 emoji lands our posts in the Bluesky "Video Games" feed, which curates
// on that emoji. Rides along with #skycave on every first-party post.
const FEED = "🎮";
const COMMUNITY = "#blacksky #blackskygamers";
// A Bluesky mention is @handle with at least one dot (name.bsky.social,
// name.blacksky.app). "skycave.space/..." has no leading @, so it never matches.
const MENTIONS_PLAYER = /@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.[a-z0-9.-]+/i;
function withTags(text: string): string {
  // No player tagged -> add the community tags; otherwise just Skycave's tag.
  // The feed emoji rides along in both cases.
  const full = MENTIONS_PLAYER.test(text)
    ? `${text}\n\n${SKYCAVE} ${FEED}`
    : `${text}\n\n${SKYCAVE} ${FEED} ${COMMUNITY}`;
  // Array.from counts by code point (emoji = 1), conservative vs graphemes.
  if (Array.from(full).length <= 300) return full;
  // Community tags pushed it over the 300 ceiling: keep #skycave + the emoji.
  const minimal = `${text}\n\n${SKYCAVE} ${FEED}`;
  return Array.from(minimal).length <= 300 ? minimal : text;
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
    // Tell Bluesky the true dimensions so it lays the image out edge-to-edge
    // instead of letterboxing it into a default box. PNG carries width/height in
    // the IHDR chunk (big-endian uint32 at byte 16/20, after the 8-byte sig).
    let aspectRatio: { width: number; height: number } | undefined;
    if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const w = dv.getUint32(16);
      const h = dv.getUint32(20);
      if (w > 0 && h > 0) aspectRatio = { width: w, height: h };
    }
    return {
      $type: "app.bsky.embed.images",
      images: [
        {
          alt: alt.slice(0, 280) || "Skycave",
          image: up.data.blob,
          ...(aspectRatio ? { aspectRatio } : {}),
        },
      ],
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
