import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");

const DOC_PATHS = [
  path.join(repoRoot, "context", "research", "00-SUMMARY.md"),
  path.join(repoRoot, "context", "research", "06-library-stack.md"),
  path.join(repoRoot, "CONTEXT-PACKAGE.md"),
] as const;

/**
 * The sentence may name the old advice. Live advice is any other occurrence.
 * D-001 withdrew both, and GSAP stays the base engine.
 */
export const WITHDRAWN_LINE =
  "D-001 withdrew the MIT fallback and the avoid Theatre advice. GSAP stays the base engine.";

const LIVE_ADVICE: readonly { label: string; pattern: RegExp }[] = [
  { label: "MIT fallback", pattern: /MIT fallback/ },
  { label: "avoid Theatre", pattern: /avoid Theatre/ },
  { label: "MIT path behind a switch", pattern: /keep an MIT path|behind a switch/ },
  { label: "avoid Theatre by default", pattern: /avoid by default:[^\n]*Theatre/ },
];

/**
 * Require the withdrawn line, then reject leftover fallback advice.
 * Stripping that one sentence is what separates a withdrawal from a plan.
 */
export function assertResearchMotionDocs(markdown: string, label = "research doc"): void {
  if (!markdown.includes(WITHDRAWN_LINE)) {
    throw new Error(`${label} is missing the withdrawn line`);
  }
  const rest = markdown.split(WITHDRAWN_LINE).join("");
  for (const advice of LIVE_ADVICE) {
    const hit = advice.pattern.exec(rest);
    if (hit) {
      throw new Error(`${label} still gives live advice (${advice.label}): ${hit[0]}`);
    }
  }
}

function refusal(markdown: string): string {
  try {
    assertResearchMotionDocs(markdown, "sample");
  } catch (error) {
    assert.ok(error instanceof Error);
    return error.message;
  }
  assert.fail("expected assertResearchMotionDocs to throw");
}

test("research and v1 record the withdrawn GSAP fallback", () => {
  assert.equal(DOC_PATHS.length, 3);
  for (const filePath of DOC_PATHS) {
    const markdown = readFileSync(filePath, "utf8");
    assertResearchMotionDocs(markdown, path.relative(repoRoot, filePath));
  }
});

test("the withdrawn line may name the advice and live phrasing still fails", () => {
  assert.doesNotThrow(() => assertResearchMotionDocs(WITHDRAWN_LINE, "only the line"));
  assert.doesNotThrow(() =>
    assertResearchMotionDocs(`${WITHDRAWN_LINE}\n${WITHDRAWN_LINE}`, "repeated"),
  );
  assert.equal(refusal("GSAP stays the base engine."), "sample is missing the withdrawn line");
  assert.match(refusal(`${WITHDRAWN_LINE}\nKeep an MIT fallback.`), /live advice \(MIT fallback\)/);
  assert.match(
    refusal(`${WITHDRAWN_LINE}\navoid Theatre.js by default.`),
    /live advice \(avoid Theatre\)/,
  );
  assert.match(
    refusal(`${WITHDRAWN_LINE}\nkeep an MIT path (Motion) behind a switch.`),
    /live advice \(MIT path behind a switch\)/,
  );
  assert.match(
    refusal(`${WITHDRAWN_LINE}\nStale libraries to avoid by default: Theatre.js.`),
    /live advice \(avoid Theatre by default\)/,
  );
});
