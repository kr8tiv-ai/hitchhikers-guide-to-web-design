import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { ScheduleError, insertReviews } from "../src/schedule.ts";

function prompts(count: number, phase = "improbability-drive"): Array<{ id: string; phase: string }> {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index + 1).padStart(3, "0"),
    phase,
  }));
}

test("one prompt gains a trailing phase-end review", () => {
  const items = insertReviews(prompts(1));
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], { id: "001", kind: "build" });
  assert.deepEqual(items[1], {
    id: "review-after-001",
    kind: "review",
    phaseEnd: true,
    effort: "xhigh",
  });
});

test("three prompts in one phase gain one review", () => {
  const items = insertReviews(prompts(3));
  assert.equal(items.length, 4);
  assert.deepEqual(
    items.map((item) => item.kind),
    ["build", "build", "build", "review"],
  );
  assert.equal(items[0]?.kind, "build");
  assert.deepEqual(items[3], {
    id: "review-after-003",
    kind: "review",
    phaseEnd: true,
    effort: "xhigh",
  });
  assert.equal(items.filter((item) => item.kind === "review").length, 1);
});

test("four prompts gain a review after the third and after the fourth", () => {
  const items = insertReviews(prompts(4));
  assert.equal(items.length, 6);
  assert.equal(items[0]?.kind, "build");
  assert.deepEqual(items[3], {
    id: "review-after-003",
    kind: "review",
    effort: "high",
  });
  assert.equal(items[3]?.phaseEnd, undefined);
  assert.deepEqual(items[4], { id: "004", kind: "build" });
  assert.deepEqual(items[5], {
    id: "review-after-004",
    kind: "review",
    phaseEnd: true,
    effort: "xhigh",
  });
});

test("a sixth prompt that is also the phase end is a single xhigh review", () => {
  const items = insertReviews(prompts(6));
  const reviews = items.filter((item) => item.kind === "review");
  assert.equal(reviews.length, 2);
  assert.equal(reviews[0]?.id, "review-after-003");
  assert.equal(reviews[0]?.effort, "high");
  assert.equal(reviews[0]?.phaseEnd, undefined);
  assert.equal(reviews[1]?.id, "review-after-006");
  assert.equal(reviews[1]?.effort, "xhigh");
  assert.equal(reviews[1]?.phaseEnd, true);
});

test("each contiguous phase ends with a review and the next phase starts with a build", () => {
  const items = insertReviews([
    { id: "001", phase: "dont-panic" },
    { id: "002", phase: "dont-panic" },
    { id: "003", phase: "dont-panic" },
    { id: "004", phase: "dont-panic" },
    { id: "005", phase: "babel-fish" },
  ]);
  assert.deepEqual(
    items.map((item) => item.id),
    [
      "001",
      "002",
      "003",
      "review-after-003",
      "004",
      "review-after-004",
      "005",
      "review-after-005",
    ],
  );
  assert.equal(items[3]?.effort, "high");
  assert.equal(items[5]?.phaseEnd, true);
  assert.equal(items[5]?.effort, "xhigh");
  assert.equal(items[6]?.kind, "build");
  assert.equal(items[7]?.phaseEnd, true);
  assert.equal(items[7]?.effort, "xhigh");
});

test("the same phase name later is a new group", () => {
  const items = insertReviews([
    { id: "001", phase: "dont-panic" },
    { id: "002", phase: "babel-fish" },
    { id: "003", phase: "dont-panic" },
  ]);
  assert.equal(items.filter((item) => item.kind === "review").length, 3);
  assert.equal(items[0]?.kind, "build");
  assert.equal(items[2]?.kind, "build");
  assert.equal(items[4]?.kind, "build");
  for (const review of items.filter((item) => item.kind === "review")) {
    assert.equal(review.phaseEnd, true);
    assert.equal(review.effort, "xhigh");
  }
});

test("review ids are deterministic and unique, and the first item is a build", () => {
  const input = prompts(4);
  const once = insertReviews(input);
  const twice = insertReviews(input.map((prompt) => ({ ...prompt })));
  assert.deepEqual(once, twice);
  assert.equal(once[0]?.kind, "build");
  assert.equal(new Set(once.map((item) => item.id)).size, once.length);
  for (const item of once) {
    assert.match(item.id, /^[a-z0-9-]+$/);
  }
});

test("empty input throws", () => {
  assert.throws(() => insertReviews([]), ScheduleError);
});

test("duplicate ids throw", () => {
  assert.throws(
    () =>
      insertReviews([
        { id: "001", phase: "dont-panic" },
        { id: "001", phase: "babel-fish" },
      ]),
    /Duplicate prompt id/,
  );
});

test("ids that already start with review- throw", () => {
  assert.throws(
    () => insertReviews([{ id: "review-001", phase: "dont-panic" }]),
    /review-/,
  );
});

test("a secret-looking id throws and a bad charset throws", () => {
  assert.throws(
    () => insertReviews([{ id: "sk-abcdefghijklmnop", phase: "dont-panic" }]),
    /secret/,
  );
  assert.throws(
    () => insertReviews([{ id: "Bad_Id", phase: "dont-panic" }]),
    /\/\^\[a-z0-9-\]\+\$\//,
  );
});

test("schedule source does not call the runner", () => {
  const source = readFileSync(
    path.join(import.meta.dirname, "..", "src", "schedule.ts"),
    "utf8",
  );
  assert.match(source, /export function insertReviews/);
  assert.doesNotMatch(source, /child_process/);
  assert.doesNotMatch(source, /spawn\(/);
  assert.doesNotMatch(source, /from ["'].*runner/);
  assert.doesNotMatch(source, /node:fs/);
  assert.doesNotMatch(source, /saveQueue/);
});
