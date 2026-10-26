import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkPacks, missingPackFields, packIsStale } from "../src/packs-check.ts";
import { removeTempDir } from "./remove-temp.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const PACKS = ["three", "r3f", "drei", "vanilla", "node", "gsap", "motion-lib", "lenis", "glsl", "audio", "stack-astro"];

test("pinned packs have the required frontmatter", () => {
  for (const name of PACKS) {
    const markdown = readFileSync(path.join(here, "..", "packs", name, "SKILL.md"), "utf8");
    assert.deepEqual(missingPackFields(markdown), [], name);
    assert.equal(markdown.includes("!"), false, name);
  }
});

test("a major bump marks a pack stale and a patch writes a review note", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-packs-239-"));
  try {
    writePack(path.join(dir, "major"), "1.0.0");
    writePack(path.join(dir, "patch"), "1.2.3");
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      const version = url.includes("major") ? "2.0.0" : "1.2.4";
      return new Response(JSON.stringify({ version, description: "notes\n## Fixes" }), { status: 200 });
    };
    await checkPacks(dir, ["major", "patch"], fetchImpl);
    const major = readFileSync(path.join(dir, "major", "SKILL.md"), "utf8");
    assert.equal(packIsStale(major), true);
    const review = readFileSync(path.join(dir, "patch", "REVIEW.md"), "utf8");
    assert.match(review, /1\.2\.4/);
    assert.equal(packIsStale(readFileSync(path.join(dir, "patch", "SKILL.md"), "utf8")), false);
  } finally {
    removeTempDir(dir);
  }
});

function writePack(dir: string, version: string): void {
  mkdirSync(dir, { recursive: true });
  const name = path.basename(dir);
  writeFileSync(
    path.join(dir, "SKILL.md"),
    [
      "---",
      `name: ${name}`,
      `version: ${version}`,
      "license: MIT",
      "docs: https://example.com/docs",
      "llms: none",
      "checked: 2026-10-19",
      `npm: ${name}`,
      "description: A fixture pack.",
      "when-to-use: Fixture only.",
      "paths:",
      `  - packs/${name}/SKILL.md`,
      "---",
      "",
      "# Fixture",
      "",
      "A short note.",
      "",
    ].join("\n"),
  );
}
