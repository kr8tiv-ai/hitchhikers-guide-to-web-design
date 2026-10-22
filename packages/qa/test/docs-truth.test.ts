import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");

/**
 * The sentence may name the old advice. Other docs and the engine doc test cite it.
 * Live advice is any other occurrence of the phrases below.
 */
const WITHDRAWN_LINE =
  "D-001 withdrew the MIT fallback and the avoid Theatre advice. GSAP stays the base engine.";

/** Instructional phrases from the pre-D-001 GSAP section and the once-over miss. */
const LIVE_PHRASES = [
  "keep the MIT fallback switch",
  "GSAP license caveat",
  "keep the MIT fallback.",
  "GSAP license risk",
  "keep an MIT path",
  "behind a switch",
  "MIT fallback",
  "avoid Theatre",
] as const;

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(heading);
  const end = markdown.indexOf("\n## ", start + heading.length);
  assert.ok(start >= 0, `missing ${heading}`);
  assert.ok(end > start, `missing the section after ${heading}`);
  return markdown.slice(start, end);
}

test("README Develop names the root test script and the engine filter", () => {
  const markdown = readFileSync(path.join(repoRoot, "README.md"), "utf8");
  const develop = section(markdown, "## Develop");
  assert.match(develop, /`pnpm test`/);
  assert.match(develop, /pnpm -r test/);
  assert.match(develop, /pnpm --filter @hitchhiker\/engine test/);
  assert.equal(develop.includes("no test script"), false);
  assert.equal(develop.includes("not wired"), false);
});

test("CONTEXT-PACKAGE defers GSAP to D-001 and keeps no live fallback advice", () => {
  const markdown = readFileSync(path.join(repoRoot, "CONTEXT-PACKAGE.md"), "utf8");
  assert.ok(markdown.includes(WITHDRAWN_LINE), "cited withdrawal sentence is missing");
  assert.match(markdown, /DECISIONS\.md D-001/);
  assert.match(markdown, /no second engine/);
  const rest = markdown.split(WITHDRAWN_LINE).join("");
  for (const phrase of LIVE_PHRASES) {
    assert.equal(rest.includes(phrase), false, `live advice remains: ${phrase}`);
  }
});

/** The 242f hero. Status and version text may change. This picture may not. */
const HERO_BLOCK = `<picture>
  <source srcset="docs/assets/hero.png" media="(prefers-reduced-motion: reduce)">
  <img src="docs/assets/hero.gif" width="100%" alt="DON'T PANIC &#8212; The Hitchhiker's Guide to Web Design">
</picture>`;

function readVersion(file: string): string {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (typeof parsed !== "object" || parsed === null || !("version" in parsed)) {
    throw new Error(`${file} has no version`);
  }
  const version = parsed.version;
  if (typeof version !== "string") throw new Error(`${file} version is not a string`);
  return version;
}

test("the CLI version, the changelog, and the README agree on 0.1.0 alpha", () => {
  const cli = readVersion(path.join(repoRoot, "packages", "cli", "package.json"));
  const rootVersion = readVersion(path.join(repoRoot, "package.json"));
  assert.equal(cli, "0.1.0");
  assert.equal(rootVersion, "0.0.0");

  const changelog = readFileSync(path.join(repoRoot, "CHANGELOG.md"), "utf8");
  assert.equal(changelog.includes("!"), false);
  assert.equal(changelog.includes("\u2014"), false);
  assert.ok(changelog.includes(`## ${cli}`), "changelog heading drifted from the CLI version");
  assert.match(changelog, /Do not npm publish/);
  assert.match(changelog, /Matt's explicit yes/);
  assert.match(changelog, /not on npm/);
  assert.match(changelog, /242f hero/);

  const readme = readFileSync(path.join(repoRoot, "README.md"), "utf8");
  assert.ok(readme.includes(HERO_BLOCK), "242f hero block changed");
  assert.match(readme, /Status: alpha/);
  assert.equal(readme.includes("pre-alpha"), false);
  assert.match(readme, /docs\/RELEASE-v0\.1\.md/);
  assert.match(readme, /CHANGELOG\.md/);
  const tryIt = section(readme, "## Try it");
  assert.match(tryIt, /npx hitchhikers-guide/);
  assert.match(tryIt, /not on the public registry yet/);
  assert.match(tryIt, new RegExp(cli.replaceAll(".", "\\.")));
});

test("the once-over report does not leave an applied fix open", () => {
  const report = readFileSync(path.join(repoRoot, "hh-build-plan", "once-over", "REPORT.md"), "utf8");
  const fixes = section(report, "## Fix prompts");
  for (let n = 1; n <= 10; n += 1) {
    const label = String(n).padStart(2, "0");
    const line = fixes.split(/\r?\n/).find((row) => new RegExp(`^${n}\\. `).test(row));
    assert.ok(line, `fix ${label} is missing from the report`);
    assert.match(line, /applied|closed/);
    assert.match(line, /Evidence:/);
  }
  assert.equal(report.includes("| PARTIAL |"), false);
  assert.equal(report.includes("| **MISSING** |"), false);
  assert.equal(report.includes("| Proposed |"), false);
});
