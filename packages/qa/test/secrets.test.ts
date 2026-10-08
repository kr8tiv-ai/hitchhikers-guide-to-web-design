import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
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

test("git push and deploy stay denied", async () => {
  const evaluateCommand = await loadEvaluateCommand();
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

/**
 * A static import of orchestrator source leaves the qa package.
 * findEscapes rejects that. The call is still evaluateCommand.
 */
async function loadEvaluateCommand(): Promise<
  (input: { argv: string[]; projectRoot: string }) => { decision: string; reason: string }
> {
  const file = path.join(repoRoot, "packages", "orchestrator", "src", "policy.ts");
  const loaded: unknown = await import(pathToFileURL(file).href);
  if (typeof loaded !== "object" || loaded === null || !("evaluateCommand" in loaded)) {
    throw new Error("evaluateCommand is missing.");
  }
  const evaluateCommand = loaded.evaluateCommand;
  if (typeof evaluateCommand !== "function") {
    throw new Error("evaluateCommand is missing.");
  }
  return (input) => {
    const result: unknown = evaluateCommand(input);
    if (typeof result !== "object" || result === null) {
      throw new Error("evaluateCommand returned nothing.");
    }
    if (!("decision" in result) || !("reason" in result)) {
      throw new Error("evaluateCommand returned nothing.");
    }
    if (typeof result.decision !== "string" || typeof result.reason !== "string") {
      throw new Error("evaluateCommand returned nothing.");
    }
    return { decision: result.decision, reason: result.reason };
  };
}
