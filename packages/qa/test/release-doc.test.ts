import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { scanText } from "../src/secrets.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const releasePath = path.join(repoRoot, "docs", "release.md");

const REQUIRED_PHRASES = [
  "pnpm --filter @hitchhiker/qa test",
  "hh doctor",
  "pnpm -r test",
  "license audit",
  "secret scan",
  "fixture drive",
  "phone gate",
  "D-001",
  "no GSAP fallback",
  "no Theatre studio",
  "prompt 159",
  "Hostinger does not run without yes",
  "real-mobile Lighthouse scores (all four at 90 or more)",
  "Do not npm publish",
  "Do not deploy",
] as const;

/**
 * Refuse a release checklist that publishes, pushes, or drops a gate.
 * `npm publish` may appear only in a negative sentence. The allowed form
 * is `Do not npm publish`. `git push` must sit on a do-not line.
 */
export function assertReleaseDoc(markdown: string): void {
  if (markdown.includes("!")) {
    throw new Error("release doc contains an exclamation mark");
  }
  const hits = scanText(markdown);
  if (hits.length > 0) {
    throw new Error(`release doc contains an API key: ${hits.map((hit) => hit.rule).join(", ")}`);
  }
  for (const sentence of sentences(markdown)) {
    if (!publishSentenceOk(sentence)) {
      throw new Error(`npm publish is an action: ${sentence}`);
    }
  }
  for (const phrase of REQUIRED_PHRASES) {
    if (!markdown.includes(phrase)) {
      throw new Error(`release doc missing phrase: ${phrase}`);
    }
  }
  const lines = markdown.split(/\r?\n/);
  if (!lines.some((line) => /\bdo not git push\b/i.test(line))) {
    throw new Error("git push is not in a do-not line");
  }
  for (const line of lines) {
    if (!gitPushLineOk(line)) {
      throw new Error(`git push is an action: ${line}`);
    }
  }
}

function sentences(markdown: string): string[] {
  const parts: string[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    for (const sentence of line.split(/(?<=[.?!])\s+/)) {
      const trimmed = sentence.trim();
      if (trimmed.length > 0) parts.push(trimmed);
    }
  }
  return parts;
}

function publishSentenceOk(sentence: string): boolean {
  const folded = sentence.toLowerCase();
  if (!folded.includes("npm publish")) return true;
  if (/\b(run|execute|then|please)\s+npm publish\b/.test(folded)) return false;
  if (/\bdo not npm publish\b/.test(folded)) {
    const rest = folded.replaceAll("do not npm publish", "");
    return !rest.includes("npm publish") || publishIsNotAStep(rest);
  }
  return publishIsNotAStep(folded);
}

function publishIsNotAStep(folded: string): boolean {
  return /\bnpm publish\b[\s\S]{0,80}\b(is|are) not (a step|steps)\b/.test(folded);
}

function gitPushLineOk(line: string): boolean {
  return sentences(line).every((sentence) => gitPushSentenceOk(sentence));
}

function gitPushSentenceOk(sentence: string): boolean {
  const folded = sentence.toLowerCase();
  if (!folded.includes("git push")) return true;
  if (/\b(run|execute|then|please|next)\s*,?\s+git push\b/.test(folded)) return false;
  if (/\bdo not git push\b/.test(folded)) {
    const rest = folded.replaceAll("do not git push", "");
    return !rest.includes("git push") || gitPushIsNotAStep(rest);
  }
  return gitPushIsNotAStep(folded);
}

function gitPushIsNotAStep(folded: string): boolean {
  return /\bgit push\b[\s\S]{0,80}\b(is|are) not (a step|steps)\b/.test(folded);
}

test("the release checklist names the audits and the bans", () => {
  const markdown = readFileSync(releasePath, "utf8");
  assertReleaseDoc(markdown);
  assert.equal(markdown.includes("!"), false);
  assert.deepEqual(scanText(markdown), []);
});

test("assertReleaseDoc allows Do not npm publish and rejects an action", () => {
  const markdown = readFileSync(releasePath, "utf8");
  assert.match(markdown, /Do not npm publish/);
  assert.throws(
    () => assertReleaseDoc(`${markdown}\nRun npm publish after the checks.`),
    /npm publish is an action/,
  );
  assert.throws(
    () => assertReleaseDoc(markdown.replaceAll("Do not npm publish", "Please npm publish")),
    /npm publish is an action/,
  );
});

test("git push must sit on a do-not line", () => {
  const markdown = readFileSync(releasePath, "utf8");
  assert.match(markdown, /do not git push/i);
  assert.throws(
    () => assertReleaseDoc(`${markdown}\nNext, git push the tag.`),
    /git push is an action/,
  );
  assert.throws(
    () => assertReleaseDoc(markdown.replaceAll("do not git push", "then git push")),
    /git push/,
  );
});

test("a missing gate and an exclamation mark fail", () => {
  const markdown = readFileSync(releasePath, "utf8");
  assert.throws(
    () => assertReleaseDoc(markdown.replaceAll("hh doctor", "hh medic")),
    /missing phrase: hh doctor/,
  );
  assert.throws(() => assertReleaseDoc(`${markdown}\nDone!`), /exclamation mark/);
});

test("an API key shape fails", () => {
  const markdown = readFileSync(releasePath, "utf8");
  const key = `xai-${"abcdef12"}`;
  assert.throws(() => assertReleaseDoc(`${markdown}\n${key}`), /API key/);
});

test("the root test script runs pnpm -r test", () => {
  const file = path.join(repoRoot, "package.json");
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (typeof parsed !== "object" || parsed === null || !("scripts" in parsed)) {
    throw new Error("root package.json has no scripts");
  }
  const scripts = parsed.scripts;
  if (typeof scripts !== "object" || scripts === null || !("test" in scripts)) {
    throw new Error("root test script is missing");
  }
  const testScript = scripts.test;
  assert.equal(testScript, "pnpm -r test");
});
