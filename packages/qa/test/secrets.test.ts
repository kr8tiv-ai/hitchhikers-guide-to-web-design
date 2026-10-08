import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateCommand } from "../../orchestrator/src/policy.ts";
import { scanText } from "../src/secrets.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const secretsDoc = path.join(repoRoot, "docs", "secrets.md");

/** Eight letters. Built in parts so this file does not contain a key literal. */
function fakeKey(): string {
  return `xai-${"abcdef12"}`;
}

function bearerToken(): string {
  return `Bearer ${"abcdEF12"}`;
}

function privateKeyBanner(): string {
  return ["BEGIN", "PRIVATE", "KEY"].join(" ");
}

test("empty text returns no hits", () => {
  assert.deepEqual(scanText(""), []);
});

test("a short prefix does not hit", () => {
  assert.deepEqual(scanText("xai-abc"), []);
  assert.deepEqual(scanText(`xai-${"abcdef1"}`), []);
});

test("a fake key hits", () => {
  const sample = fakeKey();
  const text = `prefix ${sample} suffix`;
  const hits = scanText(text);
  assert.equal(hits.length, 1, "expected one hit");
  const hit = hits[0];
  assert.ok(hit, "expected one hit");
  assert.equal(hit.rule, "xai-key", "unexpected rule");
  assert.equal(hit.index, text.indexOf(sample), "unexpected index");
});

test("a bearer token hits and a short word does not", () => {
  const sample = bearerToken();
  const hits = scanText(`Authorization: ${sample}`);
  assert.equal(hits.length, 1, "expected one hit");
  const hit = hits[0];
  assert.ok(hit, "expected one hit");
  assert.equal(hit.rule, "bearer", "unexpected rule");
  assert.equal(hit.index, "Authorization: ".length, "unexpected index");
  assert.deepEqual(scanText("Bearer short"), []);
});

test("a private key banner hits", () => {
  const banner = privateKeyBanner();
  const text = `-----${banner}-----\nbody\n`;
  const hits = scanText(text);
  assert.equal(hits.length, 1, "expected one hit");
  const hit = hits[0];
  assert.ok(hit, "expected one hit");
  assert.equal(hit.rule, "private-key", "unexpected rule");
  assert.equal(hit.index, text.indexOf(banner), "unexpected index");
});

test("hits stay in source order", () => {
  const bearer = bearerToken();
  const key = fakeKey();
  const banner = privateKeyBanner();
  const text = `${bearer}\n${key}\n${banner}`;
  const hits = scanText(text);
  assert.deepEqual(
    hits.map((hit) => hit.rule),
    ["bearer", "xai-key", "private-key"],
  );
  assert.deepEqual(
    hits.map((hit) => hit.index),
    [0, bearer.length + 1, text.length - banner.length],
  );
});

test("the secrets doc has no hits", () => {
  const text = readFileSync(secretsDoc, "utf8");
  assert.equal(text.includes(".env.local"), true);
  assert.equal(text.toLowerCase().includes("keychain"), true);
  assert.deepEqual(scanText(text), []);
});

test("git push and deploy stay denied", () => {
  const push = evaluateCommand({ argv: ["git", "push"], projectRoot: repoRoot });
  assert.equal(push.decision, "deny");
  assert.equal(push.reason, "git push is denied");

  const pushed = evaluateCommand({ argv: ["git push"], projectRoot: repoRoot });
  assert.equal(pushed.decision, "deny");
  assert.equal(pushed.reason, "git push is denied");

  const deploy = evaluateCommand({ argv: ["vercel", "--prod"], projectRoot: repoRoot });
  assert.equal(deploy.decision, "deny");
  assert.equal(deploy.reason, "deploy command is denied");
});
