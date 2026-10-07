import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { REVIEW_WIDTHS } from "../src/screenshots.ts";
import { decideVisual, type BaselineMeta } from "../src/visual-policy.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

function meta(overrides: Partial<BaselineMeta> = {}): BaselineMeta {
  return { os: "win32", scale: 1, width: 375, ...overrides };
}

test("a null baseline skips with no baseline", () => {
  const decision = decideVisual(meta(), null);
  assert.equal(decision.action, "skip-missing");
  assert.match(decision.reason, /no baseline/);
});

test("a different os skips and names both", () => {
  const decision = decideVisual(meta({ os: "win32" }), meta({ os: "darwin" }));
  assert.equal(decision.action, "skip-mismatch");
  assert.match(decision.reason, /win32/);
  assert.match(decision.reason, /darwin/);
});

test("os compare is case-sensitive", () => {
  const decision = decideVisual(meta({ os: "win32" }), meta({ os: "Win32" }));
  assert.equal(decision.action, "skip-mismatch");
  assert.match(decision.reason, /win32/);
  assert.match(decision.reason, /Win32/);
});

test("the same os and a different scale skips", () => {
  const decision = decideVisual(meta({ scale: 1 }), meta({ scale: 2 }));
  assert.equal(decision.action, "skip-mismatch");
  assert.match(decision.reason, /current 1\b/);
  assert.match(decision.reason, /baseline 2\b/);
});

test("scale 1 and 1.0 compare", () => {
  const decision = decideVisual(meta({ scale: 1 }), meta({ scale: 1.0 }));
  assert.equal(decision.action, "compare");
  assert.equal(decision.reason, "same environment");
});

test("the same meta compares", () => {
  const current = meta({ os: "linux", scale: 1.25, width: 1440 });
  const decision = decideVisual(current, { ...current });
  assert.equal(decision.action, "compare");
});

test("two review widths do not compare", () => {
  const decision = decideVisual(meta({ width: 375 }), meta({ width: 1920 }));
  assert.equal(decision.action, "skip-mismatch");
  assert.match(decision.reason, /375/);
  assert.match(decision.reason, /1920/);
});

test("a width outside REVIEW_WIDTHS throws", () => {
  assert.throws(
    () => decideVisual(meta({ width: 390 }), null),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /390/);
      return true;
    },
  );
  assert.throws(
    () => decideVisual(meta({ width: 375 }), meta({ width: 430 })),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /430/);
      return true;
    },
  );
});

test("every review width compares and the next integer throws", () => {
  for (const width of REVIEW_WIDTHS) {
    const decision = decideVisual(meta({ width }), meta({ width }));
    assert.equal(decision.action, "compare");
    assert.throws(() => decideVisual(meta({ width: width + 1 }), null), /not in REVIEW_WIDTHS/);
  }
});

test("the policy reuses REVIEW_WIDTHS and does not read image bytes", () => {
  const source = readFileSync(path.join(here, "..", "src", "visual-policy.ts"), "utf8");
  assert.match(source, /REVIEW_WIDTHS/);
  assert.doesNotMatch(source, /\[\s*375\s*,\s*768\s*,\s*1440\s*,\s*1920\s*\]/);
  assert.doesNotMatch(source, /pixelmatch|pngjs|readFileSync/);
  assert.doesNotMatch(source, /from\s+["']node:os["']/);
});
