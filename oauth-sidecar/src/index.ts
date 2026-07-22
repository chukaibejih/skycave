import express from "express";
import cookieParser from "cookie-parser";
import { createClient, FRONTEND_URL } from "./client";
import { handleCallback } from "./callback";
import { readDidFromCookie, clearSessionCookie } from "./session";

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
    const handle = ((req.query.handle as string) || "").trim();
    // Never default to bsky.social. Without a handle we can't resolve the user's
    // PDS, and silently authorizing at bsky.social locks out anyone who migrated
    // to another PDS (e.g. Blacksky) - they'd hit bsky.social's login for an
    // account that no longer exists there. Bounce back and ask for the handle.
    if (!handle) {
      return res.redirect(`${FRONTEND_URL}/?auth_error=handle`);
    }
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
  // MUST NOT be publicly routable - nginx does not proxy this path, and we also
  // require the shared internal secret as defense-in-depth. ──
  app.get("/oauth/session", (req, res) => {
    if (!INTERNAL_SECRET || req.get("x-internal-secret") !== INTERNAL_SECRET) {
      return res.status(403).json({ error: "forbidden" });
    }
    const did = readDidFromCookie(req);
    if (!did) return res.status(401).json({ error: "no_session" });
    return res.json({ did });
  });

  // ── Public route 3: logout. Browser-called (credentialed, cross-origin from
  // the frontend), so it needs CORS. Revokes the AT Protocol session at the PDS
  // and clears our session cookie. ──
  const allowCors = (req: express.Request, res: express.Response) => {
    const origin = req.get("origin");
    if (
      origin &&
      (origin === FRONTEND_URL ||
        /\.trycloudflare\.com$/.test(origin) ||
        /^http:\/\/localhost:\d+$/.test(origin))
    ) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
      res.set("Access-Control-Allow-Credentials", "true");
    }
  };
  app.options("/oauth/logout", (req, res) => {
    allowCors(req, res);
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "content-type");
    res.sendStatus(204);
  });
  app.post("/oauth/logout", async (req, res) => {
    allowCors(req, res);
    const did = readDidFromCookie(req);
    clearSessionCookie(res);
    if (did) {
      try {
        await client.revoke(did); // revoke tokens at the user's PDS
      } catch (err) {
        // The in-memory session may already be gone (sidecar restart); the
        // cookie clear above is the part that matters for the app.
        console.warn("[oauth] revoke failed:", err);
      }
    }
    res.json({ ok: true });
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
