import assert from "node:assert/strict";
import { test } from "node:test";
import type { ImageFacts } from "@hitchhiker/engine";
import {
  SMALL_FILE_REASON,
  SOFT_REASON,
  TINY_SIDE_REASON,
  grade,
  type GradeFacts,
} from "../src/grade.ts";

function facts(overrides: Partial<GradeFacts> = {}): GradeFacts {
  return {
    width: 2400,
    height: 1600,
    bytes: 80_000,
    sharpness: 0.8,
    subjectIsReal: true,
    ...overrides,
  };
}

test("a measured photo with room to spare scores 10", () => {
  const result = grade(facts());
  assert.deepEqual(result, { score: 10, reasons: [] });
  assert.notEqual(result.score, 11);
});

test("a 1x1 image scores at most 4 and at least 1", () => {
  const result = grade(
    facts({
      width: 1,
      height: 1,
      bytes: 80,
      sharpness: 0,
      subjectIsReal: true,
    }),
  );
  assert.ok(result.score <= 4);
  assert.ok(result.score >= 1);
  assert.notEqual(result.score, 0);
  assert.ok(result.reasons.includes(TINY_SIDE_REASON));
  assert.equal(TINY_SIDE_REASON, "short side or long side under 512");
});

test("grade accepts ImageFacts from readImageFacts plus sharpness", () => {
  const image: ImageFacts = {
    bytes: 68,
    width: 1,
    height: 1,
    warning: "Longest side is 1px, under 512.",
  };
  const result = grade({
    width: image.width,
    height: image.height,
    bytes: image.bytes,
    sharpness: 0.1,
    subjectIsReal: true,
  });
  assert.ok(result.score <= 4);
  assert.ok(result.score >= 1);
});

test("a long side under 512 caps the score at 4 when the file is otherwise fine", () => {
  const result = grade(facts({ width: 400, height: 300, sharpness: 1, bytes: 50_000 }));
  assert.equal(result.score, 4);
  assert.deepEqual(result.reasons, [TINY_SIDE_REASON]);
});

test("511 is under the cap and 512 is not", () => {
  const under = grade(facts({ width: 511, height: 400, sharpness: 1, bytes: 50_000 }));
  const exact = grade(facts({ width: 512, height: 512, sharpness: 1, bytes: 50_000 }));
  assert.equal(under.score, 4);
  assert.equal(exact.score, 10);
  assert.deepEqual(exact.reasons, []);
});

test("bytes under 10kb and softness each subtract, and together subtract more", () => {
  const smallFile = grade(facts({ bytes: 1000, sharpness: 1 }));
  const soft = grade(facts({ bytes: 20_000, sharpness: 0.2 }));
  const both = grade(facts({ bytes: 1000, sharpness: 0.2 }));
  assert.equal(smallFile.score, 7);
  assert.deepEqual(smallFile.reasons, [SMALL_FILE_REASON]);
  assert.equal(soft.score, 7);
  assert.deepEqual(soft.reasons, [SOFT_REASON]);
  assert.equal(both.score, 4);
  assert.ok(both.score < smallFile.score);
  assert.ok(both.score < soft.score);
});

test("10kb and sharpness 0.3 are not penalised", () => {
  const result = grade(facts({ bytes: 10 * 1024, sharpness: 0.3 }));
  assert.equal(result.score, 10);
  assert.deepEqual(result.reasons, []);
});

test("the worst measurements clamp at 1 and never return 0", () => {
  const result = grade(facts({ width: 1, height: 1, bytes: 1, sharpness: 0 }));
  assert.equal(result.score, 1);
  assert.ok(result.reasons.includes(TINY_SIDE_REASON));
  assert.ok(result.reasons.includes(SMALL_FILE_REASON));
  assert.ok(result.reasons.includes(SOFT_REASON));
});

test("a real subject does not raise the score of a tiny image", () => {
  const real = grade(facts({ width: 1, height: 1, bytes: 50_000, sharpness: 1, subjectIsReal: true }));
  const notReal = grade(facts({ width: 1, height: 1, bytes: 50_000, sharpness: 1, subjectIsReal: false }));
  assert.deepEqual(real, notReal);
  assert.equal(real.score, 4);
});

test("sharpness outside 0 to 1 throws", () => {
  assert.throws(() => grade(facts({ sharpness: -0.01 })), /sharpness must be between 0 and 1/);
  assert.throws(() => grade(facts({ sharpness: 1.01 })), /sharpness must be between 0 and 1/);
  assert.throws(() => grade(facts({ sharpness: Number.NaN })), /sharpness must be between 0 and 1/);
  assert.equal(grade(facts({ sharpness: 0 })).score, 7);
  assert.equal(grade(facts({ sharpness: 1 })).score, 10);
});
