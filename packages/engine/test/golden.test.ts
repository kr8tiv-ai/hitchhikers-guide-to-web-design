import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// The generator may quote them later.

/**
 * Test-local reader. The exported loadGolden lives in @hitchhiker/knowledge.
 * This file does not import that package: engine boundaries allow no workspace deps.
 */

const CREDIT =
  "Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.";

const MOTION_LIBS = [
  "gsap",
  "lenis",
  "three",
  "ogl",
  "motion",
  "anime",
  "theatre",
  "css-scroll",
  "vanilla",
] as const;

const HEADINGS = ["Goal", "Files", "Steps", "must_haves", "Verify"] as const;

const here = path.dirname(fileURLToPath(import.meta.url));
const goldenDir = path.resolve(here, "..", "..", "knowledge", "golden");

function loadGolden(dir: string): { page: string; motion: string; qa: string } {
  return {
    page: readFileSync(path.join(dir, "page.md"), "utf8"),
    motion: readFileSync(path.join(dir, "motion.md"), "utf8"),
    qa: readFileSync(path.join(dir, "qa.md"), "utf8"),
  };
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

function lastNonEmptyLine(text: string): string {
  const lines = text.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line !== undefined && line.trim() !== "") return line.trim();
  }
  return "";
}

function assertClean(name: string, text: string): void {
  assert.equal(/act as a/i.test(text), false, `${name} slop starter`);
  assert.equal(/ignore previous/i.test(text), false, `${name} slop starter`);
  assert.equal(text.includes("\u2014"), false, `${name} em dash`);
  assert.equal(text.includes("!"), false, `${name} exclamation mark`);
  assert.ok(wordCount(text) < 900, `${name} word count ${wordCount(text)}`);
  assert.ok(text.includes("site-rules.ts"), `${name} rules reference`);
  assert.equal(text.includes("TypeScript strict. No `any`"), false, `${name} pasted rules`);
  for (const heading of HEADINGS) {
    assert.match(text, new RegExp(`^# ${heading}\\r?$`, "m"), `${name} heading ${heading}`);
  }
  for (const key of ["truths:", "artifacts:", "key_links:", "prohibitions:"]) {
    assert.ok(text.includes(key), `${name} ${key}`);
  }
  assert.equal(lastNonEmptyLine(text), CREDIT, `${name} credit`);
}

test("three golden templates exist and pass the denylist", () => {
  const loaded = loadGolden(goldenDir);

  assertClean("page", loaded.page);
  assert.match(loaded.page, /one section/i);
  assert.match(loaded.page, /lorem/i);
  assert.match(loaded.page, /\[headline\]/);
  assert.match(loaded.page, /\[copy\]/);
  assert.ok(loaded.page.includes("No effects yet; motion comes in a later prompt."));
  assert.ok(loaded.page.includes("Add one section with real copy and layout. Motion comes later."));

  assertClean("motion", loaded.motion);
  assert.ok(loaded.motion.includes("{{library}}"));
  assert.ok(loaded.motion.includes("{{element}}"));
  assert.match(loaded.motion, /import only \{\{library\}\}/i);
  for (const lib of MOTION_LIBS) {
    assert.ok(loaded.motion.includes(`\`${lib}\``), lib);
  }
  assert.ok(loaded.motion.includes("Motion must feel confident and quick but never bouncy"));

  assertClean("qa", loaded.qa);
  assert.ok(loaded.qa.includes("375"));
  assert.ok(loaded.qa.includes("1440"));
  assert.ok(loaded.qa.includes("real mobile"));
  assert.ok(loaded.qa.includes("Lighthouse mobile 90"));
  assert.match(loaded.qa, /zero console errors/i);
  assert.match(loaded.qa, /axe/i);
  assert.ok(loaded.qa.includes("Install Playwright as a dev dependency."));
});

test("a missing motion token fails the check", () => {
  const motion = loadGolden(goldenDir).motion.replaceAll("{{library}}", "LIBRARY");
  assert.equal(motion.includes("{{library}}"), false);
  assert.throws(() => {
    if (!motion.includes("{{library}}") || !motion.includes("{{element}}")) {
      throw new Error("missing {{library}}");
    }
  }, /missing \{\{library\}\}/);
});

test("900 words fail the limit used on the templates", () => {
  const words = Array.from({ length: 900 }, () => "word").join(" ");
  assert.ok(wordCount(words) >= 900);
  assert.ok(wordCount(loadGolden(goldenDir).page) < 900);
  assert.ok(wordCount(loadGolden(goldenDir).motion) < 900);
  assert.ok(wordCount(loadGolden(goldenDir).qa) < 900);
});

test("dropping the site-rules.ts reference fails the check", () => {
  const page = loadGolden(goldenDir).page.replaceAll("site-rules.ts", "the rules file");
  assert.equal(page.includes("site-rules.ts"), false);
  assert.throws(() => {
    if (!page.includes("site-rules.ts")) throw new Error("missing site-rules.ts");
  }, /site-rules\.ts/);
});

test("quoting Matt without the credit line fails the check", () => {
  const page = loadGolden(goldenDir).page.replace(CREDIT, "");
  assert.ok(page.includes("No effects yet; motion comes in a later prompt."));
  assert.equal(lastNonEmptyLine(page) === CREDIT, false);
  assert.throws(() => {
    const quoted = page.includes("No effects yet; motion comes in a later prompt.");
    if (quoted && lastNonEmptyLine(page) !== CREDIT) {
      throw new Error("quotes Matt without the credit line");
    }
  }, /quotes Matt without the credit line/);
});
