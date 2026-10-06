import { createHash, randomBytes } from "node:crypto";

/**
 * Read-only X authorize scaffold for a later DP-0.5 step.
 * Prepares PKCE values and an authorize URL. Does not exchange a code,
 * refresh a token, post, store a verifier, or call the network.
 */

export interface PkcePair {
  verifier: string;
  challenge: string;
  method: "S256";
}

export type XOAuthField = "clientId" | "redirectUri" | "state" | "challenge";

export class XOAuthError extends Error {
  readonly field: XOAuthField;

  constructor(field: XOAuthField, message: string) {
    super(message);
    this.name = "XOAuthError";
    this.field = field;
  }
}

/**
 * Authorize origin. A later milestone must re-check the X OAuth docs
 * before anyone opens this URL. This module does not call the host.
 */
export const X_AUTHORIZE_HOST = "https://x.com";

export const X_AUTHORIZE_PATH = "/i/oauth2/authorize";

/** Read scopes only. Write scopes and offline access stay out of this milestone. */
export const X_SCOPES: readonly string[] = Object.freeze([
  "tweet.read",
  "users.read",
]);

/**
 * 48 bytes encode to 64 base64url characters, inside the PKCE 43 to 128 range.
 * base64url is a subset of the PKCE unreserved set and has no padding.
 */
const VERIFIER_BYTES = 48;

const STATE_MIN_LENGTH = 16;

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost"]);

function fail(field: XOAuthField, message: string): never {
  throw new XOAuthError(field, message);
}

/**
 * S256 PKCE pair. The caller keeps the verifier. Nothing is written to disk.
 */
export function createPkce(): PkcePair {
  const verifier = randomBytes(VERIFIER_BYTES).toString("base64url");
  const challenge = createHash("sha256").update(verifier, "utf8").digest("base64url");
  return { verifier, challenge, method: "S256" };
}

/**
 * Host text before the URL parser rewrites it.
 * Decimal, hex, and short IPv4 forms become 127.0.0.1, so the raw host
 * must already be 127.0.0.1 or localhost.
 */
function rawHost(redirectUri: string): string {
  const match = /^http:\/\/([^/?#]*)/i.exec(redirectUri);
  if (match === null) return "";
  const authority = match[1] ?? "";
  const at = authority.lastIndexOf("@");
  const hostport = at === -1 ? authority : authority.slice(at + 1);
  if (hostport.startsWith("[")) {
    const end = hostport.indexOf("]");
    return end === -1 ? hostport : hostport.slice(0, end + 1);
  }
  const colon = hostport.lastIndexOf(":");
  return colon === -1 ? hostport : hostport.slice(0, colon);
}

function assertLoopbackRedirect(redirectUri: string): void {
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    fail("redirectUri", "redirectUri is not a valid URL.");
  }
  const host = rawHost(redirectUri).toLowerCase();
  const literalLoopback = host === "127.0.0.1" || host === "localhost";
  if (
    url.protocol !== "http:" ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.hash.length > 0 ||
    !LOOPBACK_HOSTS.has(url.hostname) ||
    !literalLoopback
  ) {
    fail("redirectUri", "redirectUri must be http://127.0.0.1 or http://localhost.");
  }
}

/**
 * Authorization-code URL for the read-only scopes.
 * The challenge argument is already the S256 value from createPkce.
 * response_type is code. No client secret is added.
 */
export function buildAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}): URL {
  if (input.clientId.trim().length === 0) {
    fail("clientId", "clientId is empty.");
  }
  if (input.state.length < STATE_MIN_LENGTH) {
    fail("state", "state must be at least 16 characters.");
  }
  if (input.challenge.length === 0) {
    fail("challenge", "challenge is empty.");
  }
  assertLoopbackRedirect(input.redirectUri);

  const url = new URL(X_AUTHORIZE_PATH, X_AUTHORIZE_HOST);
  const params = new URLSearchParams();
  params.set("response_type", "code");
  params.set("client_id", input.clientId);
  params.set("redirect_uri", input.redirectUri);
  params.set("scope", X_SCOPES.join(" "));
  params.set("state", input.state);
  params.set("code_challenge", input.challenge);
  params.set("code_challenge_method", "S256");
  url.search = params.toString().replaceAll("+", "%20");
  return url;
}
