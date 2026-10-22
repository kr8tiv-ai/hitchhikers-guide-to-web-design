import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { scanText } from "../src/secrets.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const releasePath = path.join(repoRoot, "docs", "release.md");
const v01Path = path.join(repoRoot, "docs", "RELEASE-v0.1.md");

/** Specs 01-03 acceptance tests, plus the sample and the v0.1 pack notes. */
const V01_FILES = [
  "packages/qa/test/verdict.test.ts",
  "packages/qa/test/pillars.test.ts",
  "packages/qa/test/type-gate.test.ts",
  "packages/qa/test/device-matrix.test.ts",
  "packages/qa/test/reduced-motion.test.ts",
  "packages/qa/test/palette-proportion-241.test.ts",
  "packages/qa/test/weight-gate.test.ts",
  "packages/qa/test/lighthouse-gate.test.ts",
  "packages/qa/test/review-runners-241.test.ts",
  "packages/qa/test/live-gates.test.ts",
  "packages/orchestrator/test/fixture-run.test.ts",
  "packages/orchestrator/test/runner.test.ts",
  "packages/orchestrator/test/progress.test.ts",
  "packages/qa/test/gate-registry-243.test.ts",
  "packages/qa/test/spacing-gate-243.test.ts",
  "packages/orchestrator/test/ship-gate-243.test.ts",
  "packages/app/e2e/gate-card-243f.spec.ts",
  "packages/qa/test/elevate-loop.test.ts",
  "packages/qa/test/elevate-run.test.ts",
  "packages/qa/test/elevate.test.ts",
  "packages/qa/test/beauty-gate-239.test.ts",
  "packages/qa/test/defect-log-241h.test.ts",
  "packages/qa/test/juror-floor-241h.test.ts",
  "packages/cli/test/elevate-review-241l.test.ts",
  "packages/orchestrator/test/schedule.test.ts",
  "packages/orchestrator/test/queue-file.test.ts",
  "packages/qa/test/elevate-rounds-243.test.ts",
  "packages/app/e2e/reveals.spec.ts",
  "packages/deploy/test/real-adapters.test.ts",
  "packages/deploy/test/post-check.test.ts",
  "packages/deploy/test/launch-kit.test.ts",
  "packages/deploy/test/launch-wired-241k.test.ts",
  "packages/deploy/test/hostinger.test.ts",
  "packages/deploy/test/vercel.test.ts",
  "packages/deploy/test/netlify.test.ts",
  "packages/deploy/test/cloudflare.test.ts",
  "packages/cli/test/unknown-command.test.ts",
  "packages/cli/test/hh-bin.test.ts",
  "packages/deploy/test/dispatch-243.test.ts",
  "packages/deploy/test/preview-243.test.ts",
  "packages/cli/test/so-long-243.test.ts",
  "samples/towel-day.hhproject",
  "packages/engine/test/sample-project.test.ts",
  "packages/cli/test/pack-243.test.ts",
  "packages/engine/test/release-workflow.test.ts",
] as const;

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
  assert.match(markdown, /@theatre\/studio` is not installed/);
  assert.doesNotMatch(markdown, /does not name GPL/);
  assert.match(markdown, /does not list a GPL or AGPL package/);
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

/**
 * The v0.1 checklist names Specs 01-03 by file.
 * Publishing and the tag stay human, and both need Matt's explicit yes.
 * `npm publish` may appear only in a negative sentence, same rule as docs/release.md.
 */
export function assertV01Checklist(markdown: string, root: string): void {
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
  const lines = markdown.split(/\r?\n/);
  if (!lines.some((line) => /\bdo not git push\b/i.test(line))) {
    throw new Error("git push is not in a do-not line");
  }
  for (const line of lines) {
    if (!gitPushLineOk(line)) {
      throw new Error(`git push is an action: ${line}`);
    }
  }
  const required = [
    "0.1.0",
    "Matt's explicit yes",
    "Do not npm publish",
    "Do not deploy",
    "PASS_WITH_KNOWN_ISSUES",
    "BLOCKER",
    "25 MB",
    "Hostinger does not run without yes",
    "not on npm",
    "ship gate",
    "## Spec 01. Quality gates",
    "## Spec 02. Elevate loop",
    "## Spec 03. Deploy",
    ...V01_FILES,
  ];
  for (const phrase of required) {
    if (!markdown.includes(phrase)) {
      throw new Error(`v0.1 checklist missing phrase: ${phrase}`);
    }
  }
  const yeses = markdown.split("Matt's explicit yes").length - 1;
  if (yeses < 2) {
    throw new Error("Matt's explicit yes must cover the tag and the registry upload");
  }
  if (!/v0\.1\.0` tag[\s\S]{0,300}Matt's explicit yes/.test(markdown)) {
    throw new Error("the v0.1.0 tag does not name Matt's explicit yes");
  }
  for (const line of lines) {
    const match = /^- \[ \] `([^`]+)`/.exec(line);
    const rel = match?.[1];
    if (rel === undefined) continue;
    if (!existsSync(path.join(root, rel))) {
      throw new Error(`checklist path is missing on disk: ${rel}`);
    }
  }
}

test("the v0.1 checklist names Specs 01-03 by file and keeps publish human", () => {
  const markdown = readFileSync(v01Path, "utf8");
  assertV01Checklist(markdown, repoRoot);
  assert.equal(markdown.includes("!"), false);
  assert.deepEqual(scanText(markdown), []);
  assert.match(markdown, /samples\/towel-day\.hhproject/);
  assert.match(markdown, /fixture-run\.test\.ts/);
});

test("assertV01Checklist rejects a publish action, a push, and a dropped file", () => {
  const markdown = readFileSync(v01Path, "utf8");
  assert.match(markdown, /Do not npm publish/);
  assert.throws(
    () => assertV01Checklist(`${markdown}\nRun npm publish after the checks.`, repoRoot),
    /npm publish is an action/,
  );
  assert.throws(
    () => assertV01Checklist(markdown.replaceAll("Do not npm publish", "Please npm publish"), repoRoot),
    /npm publish is an action/,
  );
  assert.throws(
    () => assertV01Checklist(`${markdown}\nNext, git push the tag.`, repoRoot),
    /git push is an action/,
  );
  assert.throws(
    () =>
      assertV01Checklist(
        markdown.replaceAll("packages/qa/test/verdict.test.ts", "packages/qa/test/verdict-missing.test.ts"),
        repoRoot,
      ),
    /v0\.1 checklist missing phrase: packages\/qa\/test\/verdict\.test\.ts/,
  );
  assert.throws(
    () => assertV01Checklist(`${markdown}\n- [ ] \`packages/not-real/missing.test.ts\``, repoRoot),
    /checklist path is missing on disk: packages\/not-real\/missing\.test\.ts/,
  );
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
