import type { Request, Response } from "express";
import jwt from "jsonwebtoken";

// The browser session is a stateless signed JWT cookie carrying only the
// verified DID. FastAPI never decodes it — it calls GET /oauth/session, which is
// the single place that knows the cookie's meaning.
const COOKIE = "skycave_sid";
const SECRET = process.env.SESSION_SECRET ?? "dev-session-secret-change-me";
const DOMAIN = process.env.COOKIE_DOMAIN || undefined; // e.g. .skycave.space in prod
const SECURE = process.env.COOKIE_SECURE !== "false"; // https-only by default
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function issueSessionCookie(res: Response, did: string): void {
  const token = jwt.sign({ did }, SECRET, { expiresIn: "7d" });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: SECURE,
    sameSite: "lax", // api.skycave.space + skycave.space are same-site (shared eTLD+1)
    domain: DOMAIN,
    path: "/",
    maxAge: MAX_AGE_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE, { domain: DOMAIN, path: "/" });
}

export function readDidFromCookie(req: Request): string | null {
  const raw = (req as Request & { cookies?: Record<string, string> }).cookies?.[COOKIE];
  if (!raw) return null;
  try {
    const payload = jwt.verify(raw, SECRET) as { did?: string };
    return payload.did ?? null;
  } catch {
    return null;
  }
}

export const COOKIE_NAME = COOKIE;
