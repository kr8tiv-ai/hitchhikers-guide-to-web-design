import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  X_AUTHORIZE_HOST,
  X_AUTHORIZE_PATH,
  X_SCOPES,
  XOAuthError,
  buildAuthorizeUrl,
  createPkce,
} from "../src/x-oauth.ts";
import {
  X_SCOPES as scopesFromIndex,
  buildAuthorizeUrl as buildFromIndex,
  createPkce as createFromIndex,
} from "../src/index.ts";

const CLIENT_ID = "hh-public-client";
const STATE = "state-is-sixteen";
const REDIRECT = "http://127.0.0.1:4317/x/callback";

function authorize(overrides?: {
  clientId?: string;
  redirectUri?: string;
  state?: string;
  challenge?: string;
}): URL {
  const pair = createPkce();
  return buildAuthorizeUrl({
    clientId: overrides?.clientId ?? CLIENT_ID,
    redirectUri: overrides?.redirectUri ?? REDIRECT,
    state: overrides?.state ?? STATE,
    challenge: overrides?.challenge ?? pair.challenge,
  });
}

function throwsField(run: () => void, field: XOAuthError["field"]): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof XOAuthError);
    assert.equal(error.field, field);
    assert.equal(error.name, "XOAuthError");
    assert.equal(error.message.includes("!"), false);
    return true;
  });
}

test("createPkce returns an S256 challenge of the verifier", () => {
  const pair = createPkce();
  const again = createPkce();
  const expected = createHash("sha256").update(pair.verifier, "utf8").digest("base64url");

  assert.equal(pair.method, "S256");
  assert.equal(pair.verifier.length, 64);
  assert.ok(pair.verifier.length >= 43);
  assert.match(pair.verifier, /^[A-Za-z0-9_-]+$/);
  assert.equal(pair.challenge, expected);
  assert.equal(pair.challenge.length, 43);
  assert.notEqual(pair.verifier, again.verifier);
  assert.equal(createFromIndex, createPkce);
});

test("scope list snapshot is the two read scopes", () => {
  assert.deepEqual(X_SCOPES, ["tweet.read", "users.read"]);
  assert.equal(scopesFromIndex, X_SCOPES);
  assert.equal(Object.isFrozen(X_SCOPES), true);
  assert.equal(X_SCOPES.length, 2);
  for (const scope of X_SCOPES) {
    assert.equal(scope.includes("write"), false);
    assert.equal(scope.includes("offline"), false);
  }
  assert.throws(() => {
    (X_SCOPES as string[]).push("tweet.write");
  });
  assert.deepEqual(X_SCOPES, ["tweet.read", "users.read"]);
});

test("buildAuthorizeUrl puts read scopes and S256 on the x.com authorize host", () => {
  const pair = createPkce();
  const url = buildAuthorizeUrl({
    clientId: CLIENT_ID,
    redirectUri: REDIRECT,
    state: STATE,
    challenge: pair.challenge,
  });

  assert.equal(X_AUTHORIZE_HOST, "https://x.com");
  assert.equal(X_AUTHORIZE_PATH, "/i/oauth2/authorize");
  assert.equal(url.origin, "https://x.com");
  assert.equal(url.pathname, "/i/oauth2/authorize");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), CLIENT_ID);
  assert.equal(url.searchParams.get("redirect_uri"), REDIRECT);
  assert.equal(url.searchParams.get("scope"), X_SCOPES.join(" "));
  assert.equal(url.searchParams.get("scope"), "tweet.read users.read");
  assert.equal(url.searchParams.get("scope")?.includes(","), false);
  assert.match(url.search, /(?:^|&)scope=tweet\.read%20users\.read(?:&|$)/);
  assert.equal(url.search.includes("tweet.read,users.read"), false);
  assert.equal(url.searchParams.get("state"), STATE);
  assert.equal(url.searchParams.get("code_challenge"), pair.challenge);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.has("client_secret"), false);
  assert.equal(url.href.includes("client_secret"), false);
  assert.equal(url.href.includes(pair.verifier), false);
  assert.equal(buildFromIndex, buildAuthorizeUrl);

  const localhost = authorize({
    redirectUri: "http://localhost:3000/cb?stay=1",
  });
  assert.equal(
    localhost.searchParams.get("redirect_uri"),
    "http://localhost:3000/cb?stay=1",
  );
  const plain = authorize({ redirectUri: "http://127.0.0.1/cb" });
  assert.equal(plain.searchParams.get("redirect_uri"), "http://127.0.0.1/cb");
});

test("non-loopback redirects throw", () => {
  const rejected = [
    "https://127.0.0.1/cb",
    "https://localhost/cb",
    "http://example.com/cb",
    "http://127.0.0.1.evil.com/cb",
    "http://localhost.evil.com/cb",
    "http://user:pass@127.0.0.1/cb",
    "http://127.0.0.1@evil.com/cb",
    "http://[::1]/cb",
    "http://2130706433/cb",
    "http://0x7f.0.0.1/cb",
    "http://127.1/cb",
    "http://127.0.0.1/cb#fragment",
    "not a url",
    "",
    "javascript:alert(1)",
    "file:///tmp/cb",
  ];
  for (const redirectUri of rejected) {
    assert.throws(
      () => authorize({ redirectUri }),
      (error: unknown) => {
        assert.ok(error instanceof XOAuthError);
        assert.equal(error.field, "redirectUri");
        assert.equal(error.message.includes("!"), false);
        return true;
      },
      redirectUri,
    );
  }
});

test("empty clientId and short state throw", () => {
  throwsField(() => authorize({ clientId: "" }), "clientId");
  throwsField(() => authorize({ clientId: "   " }), "clientId");
  throwsField(() => authorize({ state: "0123456789abcde" }), "state");
  throwsField(() => authorize({ state: "" }), "state");
  throwsField(() => authorize({ challenge: "" }), "challenge");

  const url = authorize({ state: "0123456789abcdef" });
  assert.equal(url.searchParams.get("state"), "0123456789abcdef");

  const injected = "hh-public-client&client_secret=not-a-secret";
  const encoded = authorize({ clientId: injected });
  assert.equal(encoded.searchParams.get("client_id"), injected);
  assert.equal(encoded.searchParams.has("client_secret"), false);
});

test("the module has no post or token endpoint", () => {
  const sourcePath = fileURLToPath(new URL("../src/x-oauth.ts", import.meta.url));
  const source = readFileSync(sourcePath, "utf8");
  assert.equal(source.includes("tweet.write"), false);
  assert.equal(source.includes("statuses/update"), false);
  assert.equal(source.includes("oauth2/token"), false);
  assert.equal(source.includes("/2/tweets"), false);
  assert.equal(source.includes("node:fs"), false);
  assert.equal(source.includes("node:http"), false);
  assert.equal(source.includes("node:https"), false);
  assert.equal(source.includes("fetch("), false);
  assert.equal(source.includes("STATE.md"), false);

  const pair = createPkce();
  let fetched = false;
  const original = globalThis.fetch;
  globalThis.fetch = (() => {
    fetched = true;
    throw new Error("network");
  }) as typeof fetch;
  try {
    const url = buildAuthorizeUrl({
      clientId: CLIENT_ID,
      redirectUri: REDIRECT,
      state: STATE,
      challenge: pair.challenge,
    });
    assert.equal(url.protocol, "https:");
    assert.equal(fetched, false);
  } finally {
    globalThis.fetch = original;
  }
});
