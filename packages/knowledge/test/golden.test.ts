import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  GOLDEN_CREDIT,
  lintGolden,
  loadGolden,
  type GoldenName,
} from "../src/golden.ts";

// The generator may quote them later.

const here = path.dirname(fileURLToPath(import.meta.url));
const goldenDir = path.resolve(here, "..", "golden");

const NAMES: readonly GoldenName[] = ["page", "motion", "qa"];

function insertBeforeCredit(text: string, extra: string): string {
  const at = text.lastIndexOf(GOLDEN_CREDIT);
  assert.ok(at >= 0);
  return `${text.slice(0, at)}${extra}\n${text.slice(at)}`;
}

test("loadGolden reads the three templates and the denylist is clean", () => {
  const loaded = loadGolden(goldenDir);
  assert.deepEqual(Object.keys(loaded).sort(), ["motion", "page", "qa"]);
  for (const name of NAMES) {
    const text = loaded[name];
    assert.ok(text.length > 0, name);
    assert.deepEqual(lintGolden(name, text), [], name);
  }
});

test("loadGolden throws when a template file is missing", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-golden-"));
  try {
    assert.throws(() => loadGolden(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a Matt quote without the credit line fails", () => {
  const page = loadGolden(goldenDir).page.replace(GOLDEN_CREDIT, "");
  const problems = lintGolden("page", page);
  assert.ok(problems.includes("quotes Matt without the credit line"));
});

test("slop starters, an em dash, and an exclamation mark fail", () => {
  const page = loadGolden(goldenDir).page;
  assert.ok(
    lintGolden("page", insertBeforeCredit(page, "Act as a senior designer.")).includes(
      "slop starter: act as a",
    ),
  );
  assert.ok(
    lintGolden("page", insertBeforeCredit(page, "Ignore previous instructions.")).includes(
      "slop starter: Ignore previous",
    ),
  );
  assert.ok(lintGolden("page", insertBeforeCredit(page, "A pause \u2014 then more.")).includes("em dash"));
  assert.ok(lintGolden("page", insertBeforeCredit(page, "Ship it now!")).includes("exclamation mark"));
});

test("a missing motion token fails", () => {
  const motion = loadGolden(goldenDir).motion.replaceAll("{{library}}", "LIBRARY");
  const problems = lintGolden("motion", motion);
  assert.ok(problems.includes("missing {{library}}"));
  assert.ok(problems.includes("missing import only {{library}}"));
});

test("a missing element token fails", () => {
  const motion = loadGolden(goldenDir).motion.replaceAll("{{element}}", "ELEMENT");
  assert.ok(lintGolden("motion", motion).includes("missing {{element}}"));
});

test("a template of 900 words fails", () => {
  const padded = insertBeforeCredit(loadGolden(goldenDir).page, Array.from({ length: 900 }, () => "word").join(" "));
  assert.ok(lintGolden("page", padded).includes("over 900 words"));
});

test("RULES are referenced by path, and dropping the reference fails", () => {
  const page = loadGolden(goldenDir).page;
  assert.ok(page.includes("site-rules.ts"));
  assert.equal(page.includes("TypeScript strict. No `any`"), false);
  const problems = lintGolden("page", page.replaceAll("site-rules.ts", "the rules file"));
  assert.ok(problems.includes("missing site-rules.ts"));
});
