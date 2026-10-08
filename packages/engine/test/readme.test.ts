import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const readmePath = path.join(repoRoot, "README.md");
const commandsPath = path.join(repoRoot, "packages", "grok-plugin", "src", "commands.ts");
const interviewPath = path.join(repoRoot, "docs", "dont-panic.md");

const PANIC_PERIOD = "don't panic.";

/**
 * Refuse a public README that breaks the Guide voice.
 * Throws on an exclamation mark, on "Don't Panic!", on autistic, autism,
 * or spectrum, on an em dash, and on "Don't Panic." more than once.
 * A curly apostrophe is treated as a straight one.
 */
export function assertReadme(markdown: string): void {
  const normalized = markdown.replaceAll("\u2019", "'").replaceAll("\u2018", "'");
  const lower = normalized.toLowerCase();
  if (lower.includes("don't panic!")) {
    throw new Error("README refused: Don't Panic!");
  }
  if (normalized.includes("!")) {
    throw new Error("README refused: exclamation mark");
  }
  if (lower.includes("autistic")) {
    throw new Error("README refused: autistic");
  }
  if (lower.includes("autism")) {
    throw new Error("README refused: autism");
  }
  if (lower.includes("spectrum")) {
    throw new Error("README refused: spectrum");
  }
  if (normalized.includes("\u2014")) {
    throw new Error("README refused: em dash");
  }
  let count = 0;
  let from = 0;
  while (from < lower.length) {
    const at = lower.indexOf(PANIC_PERIOD, from);
    if (at < 0) return;
    count += 1;
    if (count > 1) {
      throw new Error("README refused: Don't Panic. more than once");
    }
    from = at + PANIC_PERIOD.length;
  }
}

function between(source: string, startMark: string, endMark: string): string {
  const start = source.indexOf(startMark);
  const end = source.indexOf(endMark, start + startMark.length);
  assert.ok(start >= 0, `missing ${startMark}`);
  assert.ok(end > start, `missing ${endMark}`);
  return source.slice(start, end);
}

function cliNames(source: string): string[] {
  const block = between(source, "export const COMMANDS", "export const SKILL_NAMES");
  const names: string[] = [];
  for (const match of block.matchAll(/cli:\s*\["([^"]+)"\]/g)) {
    const name = match[1];
    if (name !== undefined) names.push(name);
  }
  assert.ok(names.length > 0, "CLI names parsed from commands.ts");
  return names;
}

function skillNames(source: string): string[] {
  const block = between(source, "export const SKILL_NAMES", "export const SIDE_EFFECT_SKILLS");
  const names: string[] = [];
  for (const match of block.matchAll(/"([^"]+)"/g)) {
    const name = match[1];
    if (name !== undefined) names.push(name);
  }
  assert.ok(names.length > 0, "skill names parsed from commands.ts");
  return names;
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

function refusal(markdown: string): string {
  try {
    assertReadme(markdown);
  } catch (error) {
    assert.ok(error instanceof Error);
    return error.message;
  }
  assert.fail("expected assertReadme to throw");
}

test("assertReadme reads README.md from disk", () => {
  const markdown = readFileSync(readmePath, "utf8");
  assert.equal(path.basename(readmePath), "README.md");
  assertReadme(markdown);
  assert.equal(markdown.toLowerCase().split(PANIC_PERIOD).length - 1, 1);
  assert.ok(wordCount(markdown) < 900, `README is ${wordCount(markdown)} words`);
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(markdown), false);
  assert.equal(markdown.toLowerCase().includes("fallback"), false);
  assert.equal(markdown.toLowerCase().includes("imagine is free"), false);
  assert.equal(markdown.toLowerCase().includes("free with supergrok"), false);

  const required = [
    "https://github.com/kr8tiv-ai/hitchhikers-guide-to-web-design",
    "npx hitchhikers-guide",
    "hh install",
    ".grok",
    "install prompt",
    "/hh-new",
    "/hh-dont-panic",
    "hosted builder",
    "drag-and-drop",
    "template store",
    "paid SaaS",
    "GSAP",
    "ScrollTrigger",
    "SplitText",
    "Three.js",
    "WebGL",
    "GLSL",
    "OGL",
    "WebGL2",
    "Motion",
    "anime.js",
    "Theatre.js",
    "@theatre/core",
    "Lenis",
    "CSS scroll-driven",
    "vanilla JS",
    "picker chooses per effect",
    "import only what they use",
    "Node 22",
    "pnpm",
    "pnpm -w test",
    "antihero.community",
    "open-gsd/gsd-core",
    "NOTICE",
    "MIT",
    "vendor/gsd-core",
    "not a runtime dependency",
    "hh doctor",
    "hh mostly-harmless",
    "hh elevate",
    "yes",
  ];
  for (const phrase of required) {
    assert.ok(markdown.includes(phrase), `missing phrase: ${phrase}`);
  }

  const source = readFileSync(commandsPath, "utf8");
  for (const name of cliNames(source)) {
    assert.ok(markdown.includes(`hh ${name}`), `missing CLI command: hh ${name}`);
  }
  for (const name of skillNames(source)) {
    assert.ok(markdown.includes(`/${name}`), `missing skill: /${name}`);
  }

  const elevate = markdown.split("\n").find((line) => line.includes("`hh elevate`"));
  assert.ok(elevate, "elevate row");
  assert.match(elevate, /yes/);
  const gates = markdown.split("\n").find((line) => line.includes("`hh mostly-harmless`"));
  assert.ok(gates, "mostly-harmless row");
  const doctor = markdown.split("\n").find((line) => line.includes("`hh doctor`"));
  assert.ok(doctor, "doctor row");

  const motionStart = markdown.indexOf("## Motion");
  const developStart = markdown.indexOf("## Develop");
  assert.ok(motionStart >= 0 && developStart > motionStart);
  const motion = markdown.slice(motionStart, developStart).trim();
  const body = motion.split("\n").slice(1).join("\n").trim();
  assert.equal(body.includes("\n\n"), false);
});

test("assertReadme throws on the banned strings", () => {
  assert.equal(refusal("Don't Panic!"), "README refused: Don't Panic!");
  assert.equal(refusal("Don\u2019t Panic!"), "README refused: Don't Panic!");
  assert.equal(refusal("Hello!"), "README refused: exclamation mark");
  assert.equal(refusal("The word autistic appears."), "README refused: autistic");
  assert.equal(refusal("The word Autism appears."), "README refused: autism");
  assert.equal(refusal("The word spectrum appears."), "README refused: spectrum");
  assert.equal(refusal("An em dash \u2014 sits here."), "README refused: em dash");
  assert.equal(
    refusal("Don't Panic. Then Don't Panic. again."),
    "README refused: Don't Panic. more than once",
  );
  assert.doesNotThrow(() => assertReadme("Don't Panic. Plain words after."));
});

test("docs/dont-panic.md points at hh doctor and the interview", () => {
  const page = readFileSync(interviewPath, "utf8");
  assertReadme(page);
  assert.match(page, /hh doctor/);
  assert.match(page, /\/hh-dont-panic/);
  assert.match(page, /interview/);
  assert.ok(wordCount(page) < wordCount(readFileSync(readmePath, "utf8")));
});
