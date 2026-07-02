import { readFileSync } from "node:fs";
import { NodeOAuthClient } from "@atproto/oauth-client-node";
import { JoseKey } from "@atproto/jwk-jose";

// The ES256 key is a multi-line PEM, which docker `env_file` can't carry. Accept
// it three ways (in priority order): a mounted file path, a base64 blob (env-
// friendly single line), or a raw PEM with literal or escaped newlines.
function loadPrivateKeyPem(): string {
  const file = process.env.OAUTH_PRIVATE_KEY_FILE;
  if (file) return readFileSync(file, "utf8");
  const raw = process.env.OAUTH_PRIVATE_KEY;
  if (!raw) throw new Error("Set OAUTH_PRIVATE_KEY_FILE or OAUTH_PRIVATE_KEY");
  if (!raw.includes("BEGIN")) return Buffer.from(raw, "base64").toString("utf8");
  return raw.replace(/\\n/g, "\n");
}

// Public base at which this sidecar is served (nginx proxies api.skycave.space/oauth/*).
// e.g. https://api.skycave.space/oauth
const BASE = (process.env.PUBLIC_OAUTH_BASE ?? "http://localhost:8001/oauth").replace(
  /\/$/,
  ""
);
const FRONTEND = process.env.FRONTEND_URL ?? "http://localhost:3000";
// atproto requires client_uri to share the client_id's origin. The metadata is
// hosted on the API origin (e.g. https://api.skycave.space), not the frontend
// apex, so derive it from BASE rather than using FRONTEND_URL.
const CLIENT_ORIGIN = new URL(BASE).origin;

// In-memory stores. State only needs to live across the login->callback round
// trip (same process, seconds). We discard the OAuth session right after the
// callback — Skycave only needs to *verify* DID ownership, then issues its own
// signed cookie. (Swap to a Redis-backed store if the sidecar is ever scaled out.)
const stateStore = new Map<string, NodeSavedState>();
const sessionStore = new Map<string, NodeSavedSession>();

// Minimal store value types (the library persists opaque blobs).
type NodeSavedState = Parameters<
  NonNullable<ConstructorParameters<typeof NodeOAuthClient>[0]["stateStore"]>["set"]
>[1];
type NodeSavedSession = Parameters<
  NonNullable<ConstructorParameters<typeof NodeOAuthClient>[0]["sessionStore"]>["set"]
>[1];

export async function createClient(): Promise<NodeOAuthClient> {
  // ES256 private key (PEM) — see DEPLOY.md for the openssl generation step.
  const key = await JoseKey.fromImportable(loadPrivateKeyPem(), "skycave-oauth-1");

  return new NodeOAuthClient({
    clientMetadata: {
      client_id: `${BASE}/client-metadata.json`,
      client_name: "Skycave",
      client_uri: CLIENT_ORIGIN,
      redirect_uris: [`${BASE}/callback`],
      // Stick to the broad `atproto` scope — granular scopes aren't finalized.
      scope: "atproto",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      // Confidential client: private_key_jwt + ES256 (DPoP mandatory).
      token_endpoint_auth_method: "private_key_jwt",
      token_endpoint_auth_signing_alg: "ES256",
      dpop_bound_access_tokens: true,
      application_type: "web",
      jwks_uri: `${BASE}/jwks.json`,
    },
    keyset: [key],
    stateStore: {
      async set(k, v) {
        stateStore.set(k, v);
      },
      async get(k) {
        return stateStore.get(k);
      },
      async del(k) {
        stateStore.delete(k);
      },
    },
    sessionStore: {
      async set(k, v) {
        sessionStore.set(k, v);
      },
      async get(k) {
        return sessionStore.get(k);
      },
      async del(k) {
        sessionStore.delete(k);
      },
    },
  });
}

export const FRONTEND_URL = FRONTEND;
