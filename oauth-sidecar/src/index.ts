import express from "express";
import cookieParser from "cookie-parser";
import { createClient, FRONTEND_URL } from "./client";
import { handleCallback } from "./callback";
import { readDidFromCookie } from "./session";

const PORT = Number(process.env.PORT ?? 3001);
const INTERNAL_SECRET = process.env.OAUTH_INTERNAL_SECRET ?? "";

async function main() {
  const client = await createClient();
  const app = express();
  app.use(cookieParser());

  // ── Public OAuth metadata (atproto requires these at the client_id URL) ──
  app.get("/oauth/client-metadata.json", (_req, res) => {
    res.json(client.clientMetadata);
  });
  app.get("/oauth/jwks.json", (_req, res) => {
    res.json(client.jwks);
  });

  // ── Public route 1: start login (PAR -> redirect to the user's PDS) ──
  app.get("/oauth/login", async (req, res) => {
    const handle = (req.query.handle as string) || "https://bsky.social";
    try {
      const url = await client.authorize(handle, { scope: "atproto" });
      res.redirect(url.toString());
    } catch (err) {
      console.error("[oauth] authorize failed:", err);
      res.redirect(`${FRONTEND_URL}/?auth_error=authorize`);
    }
  });

  // ── Public route 2: callback (token exchange + cookie) ──
  app.get("/oauth/callback", (req, res) => handleCallback(client, req, res));

  // ── Internal only: FastAPI resolves the current DID from the cookie.
  // MUST NOT be publicly routable — nginx does not proxy this path, and we also
  // require the shared internal secret as defense-in-depth. ──
  app.get("/oauth/session", (req, res) => {
    if (!INTERNAL_SECRET || req.get("x-internal-secret") !== INTERNAL_SECRET) {
      return res.status(403).json({ error: "forbidden" });
    }
    const did = readDidFromCookie(req);
    if (!did) return res.status(401).json({ error: "no_session" });
    return res.json({ did });
  });

  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

  app.listen(PORT, () => {
    console.log(`skycave oauth-sidecar listening on :${PORT}`);
  });
}

main().catch((err) => {
  console.error("[oauth] fatal:", err);
  process.exit(1);
});
