import type { Request, Response } from "express";
import type { NodeOAuthClient } from "@atproto/oauth-client-node";
import { issueSessionCookie } from "./session";
import { FRONTEND_URL } from "./client";

// Completes the OAuth authorization-code exchange (DPoP-bound), verifies the
// DID, issues our signed session cookie, then bounces back to the frontend.
export async function handleCallback(
  client: NodeOAuthClient,
  req: Request,
  res: Response
): Promise<void> {
  const query = req.originalUrl.split("?")[1] ?? "";
  try {
    const { session } = await client.callback(new URLSearchParams(query));
    issueSessionCookie(res, session.did);
    res.redirect(`${FRONTEND_URL}/oauth?ok=1`);
  } catch (err) {
    console.error("[oauth] callback failed:", err);
    res.redirect(`${FRONTEND_URL}/oauth?error=callback`);
  }
}
