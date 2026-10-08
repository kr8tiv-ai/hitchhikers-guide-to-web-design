import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { renderDeployDocs } from "../src/docs.ts";

const YES = "Nothing deploys without an explicit yes.";

function render(overrides: Partial<Parameters<typeof renderDeployDocs>[0]> = {}) {
  return renderDeployDocs({
    host: "hostinger",
    kind: "static",
    maintainer: "Ada",
    siteWhy: "A night stall for regulars.",
    ...overrides,
  });
}

function words(markdown: string): number {
  return markdown.trim().split(/\s+/).filter((word) => word.length > 0).length;
}

test("a static Hostinger site renders Deploy and Handoff", () => {
  const docs = render();
  assert.match(docs.deployMd, /^# Deploy\n/);
  assert.match(docs.handoffMd, /^# Handoff\n/);
  assert.match(docs.deployMd, /This site is static\./);
  assert.match(docs.deployMd, /Guide function: deployHostinger/);
  assert.match(docs.deployMd, /Command: deployHostinger with kind static/);
  assert.match(docs.deployMd, /Upload the built files/);
  assert.match(docs.handoffMd, /Maintainer: Ada/);
  assert.match(docs.handoffMd, /Hosting: Hostinger/);
  assert.match(docs.handoffMd, /Why: A night stall for regulars\./);
  assert.match(docs.handoffMd, /Elevate/);
  assert.match(docs.handoffMd, /\/hh-elevate/);
  assert.match(docs.handoffMd, /blog post/);
  assert.match(docs.handoffMd, /Renew the domain/);
  assert.match(docs.handoffMd, /Roll back/);
  assert.equal(docs.deployMd.includes("50 MB"), false);
  assert.equal(docs.handoffMd.includes("50 MB"), false);
  assert.equal(docs.deployMd.includes("node_modules"), false);
  assert.equal(docs.handoffMd.includes("node_modules"), false);
  assert.equal(docs.deployMd.includes("!"), false);
  assert.equal(docs.handoffMd.includes("!"), false);
  assert.equal(docs.deployMd.includes("http://"), false);
  assert.equal(docs.deployMd.includes("https://"), false);
  assert.equal(docs.handoffMd.includes("http://"), false);
  assert.equal(docs.handoffMd.includes("https://"), false);
});

test("the approval sentence is present", () => {
  const docs = render();
  assert.equal(docs.deployMd.includes(YES), true);
  assert.equal(docs.handoffMd.includes(YES), true);
});

test("hostinger node mentions 50 MB and node_modules", () => {
  const docs = render({ kind: "node" });
  assert.match(docs.deployMd, /This site is Node\./);
  assert.match(docs.deployMd, /50 MB/);
  assert.match(docs.deployMd, /node_modules/);
  assert.match(docs.handoffMd, /50 MB/);
  assert.match(docs.handoffMd, /node_modules/);
  assert.equal(words(`${docs.deployMd}\n${docs.handoffMd}`) < 500, true);
});

test("vercel, netlify, and cloudflare static docs name their commands and skip node guidance", () => {
  const cases = [
    { host: "vercel" as const, fn: "deployVercel", command: "`vercel deploy`" },
    { host: "netlify" as const, fn: "deployNetlify", command: "`netlify deploy`" },
    { host: "cloudflare" as const, fn: "deployCloudflare", command: "`wrangler deploy`" },
  ];
  for (const item of cases) {
    const docs = render({ host: item.host });
    assert.match(docs.deployMd, new RegExp(`Guide function: ${item.fn}`));
    assert.match(docs.deployMd, new RegExp(item.command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(docs.deployMd, /This site is static\./);
    assert.equal(docs.deployMd.includes(YES), true);
    assert.equal(docs.deployMd.includes("50 MB"), false);
    assert.equal(docs.handoffMd.includes("node_modules"), false);
    assert.match(docs.handoffMd, new RegExp(`Hosting: ${item.host[0]?.toUpperCase()}${item.host.slice(1)}`));
  }
});

test("vercel node throws", () => {
  assert.throws(
    () => render({ host: "vercel", kind: "node" }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "Vercel template is not wired");
      return true;
    },
  );
});

test("netlify and cloudflare node throw", () => {
  assert.throws(() => render({ host: "netlify", kind: "node" }), /Netlify template is not wired/);
  assert.throws(() => render({ host: "cloudflare", kind: "node" }), /Cloudflare template is not wired/);
});

test("a fixture secret xai- in the maintainer throws", () => {
  const secret = "xai-fixture-token-should-not-leak";
  assert.throws(
    () => render({ maintainer: secret }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /xai-/);
      assert.equal(error.message.includes("fixture-token"), false);
      return true;
    },
  );
});

test("secrets in siteWhy are rejected", () => {
  assert.throws(() => render({ siteWhy: "Bearer token-value-here" }), /Bearer /);
  assert.throws(() => render({ siteWhy: "prefix sk-live-value" }), /sk-/);
});

test("empty siteWhy and empty maintainer throw", () => {
  assert.throws(() => render({ siteWhy: "" }), /siteWhy is empty/);
  assert.throws(() => render({ siteWhy: " \n\t " }), /siteWhy is empty/);
  assert.throws(() => render({ maintainer: "" }), /maintainer is empty/);
  assert.throws(() => render({ maintainer: "   " }), /maintainer is empty/);
});

test("a newline in siteWhy is flattened", () => {
  const docs = render({ siteWhy: "First line\r\nsecond line" });
  assert.match(docs.handoffMd, /Why: First line second line/);
  assert.equal(docs.handoffMd.includes("First line\nsecond line"), false);
  assert.equal(docs.handoffMd.includes("First line\r\nsecond line"), false);
});

test("undecided and other unexpected hosts throw", () => {
  assert.throws(
    () => render({ host: "undecided" as "hostinger" }),
    /deploy host undecided/,
  );
  assert.throws(() => render({ host: "github" as "hostinger" }), /unexpected deploy host/);
  assert.throws(() => render({ kind: "ssr" as "static" }), /deploy kind must be static or node/);
});

test("an exclamation mark in an input is rejected", () => {
  assert.throws(() => render({ maintainer: "Ada!" }), /exclamation marks are not allowed/);
});

test("the module returns strings and does not write a project", () => {
  const source = readFileSync(fileURLToPath(new URL("../src/docs.ts", import.meta.url)), "utf8");
  assert.equal(source.includes("node:fs"), false);
  assert.equal(source.includes("writeFile"), false);
  assert.equal(source.includes("https://"), false);
  assert.equal(source.includes("http://"), false);
  assert.equal(source.includes("xai-"), true);
  const docs = render();
  assert.equal(typeof docs.deployMd, "string");
  assert.equal(typeof docs.handoffMd, "string");
});
