import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { Effort } from "@hitchhiker/engine";
import { bumpEffort } from "../src/effort.ts";
import type { SensorVerdict } from "../src/sensors.ts";
import { TriageError, decideTriage, type TriageAction } from "../src/triage.ts";

const BACKUP = "hh/backup-2026-10-07";

type TriageInput = Parameters<typeof decideTriage>[0];

function input(overrides: Partial<TriageInput> = {}): TriageInput {
  return {
    verdict: "build-failed",
    attempt: 1,
    rule: 1,
    packageFailed: false,
    promptId: "p1",
    tags: ["hh-good-p1"],
    backup: BACKUP,
    effort: "medium",
    ...overrides,
  };
}

function assertNoSwap(reason: string): void {
  assert.match(reason, /do not swap the package/i);
  assert.doesNotMatch(reason, /!/);
  assert.doesNotMatch(
    reason,
    /instead|alternative|substitute|replacement|replace with|different (package|library)|try /i,
  );
}

function assertRollback(action: TriageAction, ref: string): void {
  assert.equal(action.type, "rollback");
  if (action.type !== "rollback") return;
  assert.equal(action.ref, ref);
  assert.notEqual(action.ref, "origin/main");
  assert.notEqual(action.ref, "main");
  assert.equal(action.ref.startsWith("origin/"), false);
  assert.equal(/\bpush\b/i.test(action.ref), false);
}

test("success stops and does not retry", () => {
  const action = decideTriage(input({ verdict: "ok", attempt: 3, rule: 1, effort: "xhigh" }));
  assert.deepEqual(action, { type: "stop", note: "already green" });
});

test("a failed install escalates and does not suggest another package", () => {
  const fromBuild = decideTriage(
    input({ packageFailed: true, rule: 1, verdict: "build-failed", attempt: 1 }),
  );
  assert.equal(fromBuild.type, "escalate");
  if (fromBuild.type === "escalate") assertNoSwap(fromBuild.reason);

  const fromStall = decideTriage(
    input({ packageFailed: true, rule: 1, verdict: "stall", attempt: 1 }),
  );
  assert.equal(fromStall.type, "escalate");
  if (fromStall.type === "escalate") assertNoSwap(fromStall.reason);
});

test("rule 4 escalates and packageFailed wins over an ok verdict", () => {
  const architectural = decideTriage(
    input({ rule: 4, packageFailed: false, verdict: "build-failed" }),
  );
  assert.equal(architectural.type, "escalate");
  if (architectural.type === "escalate") assertNoSwap(architectural.reason);

  const greenInstall = decideTriage(
    input({ rule: 4, packageFailed: true, verdict: "ok", attempt: 1 }),
  );
  assert.equal(greenInstall.type, "escalate");
  if (greenInstall.type === "escalate") assertNoSwap(greenInstall.reason);

  const greenRule = decideTriage(
    input({ rule: 4, packageFailed: false, verdict: "ok" }),
  );
  assert.equal(greenRule.type, "escalate");
});

test("rule 1 attempts 1 and 2 retry with bumped effort", () => {
  const first = decideTriage(input({ attempt: 1, effort: "medium", verdict: "build-failed" }));
  assert.deepEqual(first, { type: "retry", effort: bumpEffort("medium").effort });

  const second = decideTriage(input({ attempt: 2, effort: "high", verdict: "build-failed" }));
  assert.deepEqual(second, { type: "retry", effort: bumpEffort("high").effort });

  const capped = decideTriage(input({ attempt: 2, effort: "xhigh", verdict: "crash" }));
  assert.deepEqual(capped, { type: "retry", effort: "xhigh" });
});

test("three mechanical strikes roll back on the third attempt", () => {
  let effort: Effort = "medium";
  const seen: TriageAction[] = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const action = decideTriage(
      input({ attempt, effort, verdict: "build-failed", promptId: "p1", tags: ["hh-good-p1"] }),
    );
    seen.push(action);
    if (action.type === "retry") effort = action.effort;
  }

  assert.deepEqual(seen[0], { type: "retry", effort: "high" });
  assert.deepEqual(seen[1], { type: "retry", effort: "xhigh" });
  const third = seen[2];
  if (third === undefined) {
    assert.fail("missing third attempt");
  }
  assertRollback(third, "hh-good-p1");
});

test("a fourth strike escalates with three options and does not retry", () => {
  for (const attempt of [4, 5, 9]) {
    const action = decideTriage(input({ attempt, effort: "xhigh", verdict: "build-failed" }));
    assert.equal(action.type, "escalate");
    if (action.type !== "escalate") continue;
    assertNoSwap(action.reason);
    assert.match(action.reason, /edit the spec/i);
    assert.match(action.reason, /backup/i);
    assert.match(action.reason, /stop the drive/i);
  }
});

test("rule 1 attempt 3 rolls back to the good tag for that prompt", () => {
  const action = decideTriage(
    input({
      attempt: 3,
      verdict: "crash",
      promptId: "p1",
      tags: ["hh-good-p0", "hh-good-p1", "hh-good-p2"],
      backup: BACKUP,
    }),
  );
  assertRollback(action, "hh-good-p1");
});

test("rollback uses the backup when that prompt has no good tag", () => {
  const action = decideTriage(
    input({
      attempt: 3,
      promptId: "p1",
      tags: ["hh-good-p9", "HH-good-p1", "refs/tags/hh-good-p1"],
      backup: BACKUP,
    }),
  );
  assertRollback(action, BACKUP);
});

test("a good tag is enough when backup is blank", () => {
  const action = decideTriage(input({ attempt: 3, backup: "", tags: ["hh-good-p1"] }));
  assertRollback(action, "hh-good-p1");
});

test("rollback ref is never origin/main", () => {
  const tagged = decideTriage(
    input({ attempt: 3, backup: "origin/main", tags: ["hh-good-p1"], promptId: "p1" }),
  );
  assertRollback(tagged, "hh-good-p1");

  assert.throws(
    () => decideTriage(input({ attempt: 3, tags: [], backup: "origin/main" })),
    (error: unknown) => error instanceof TriageError,
  );
  assert.throws(
    () => decideTriage(input({ attempt: 3, tags: ["origin/main"], backup: "origin/main" })),
    (error: unknown) => error instanceof TriageError,
  );
  assert.throws(
    () => decideTriage(input({ attempt: 3, tags: [], backup: "refs/remotes/origin/main" })),
    (error: unknown) => error instanceof TriageError,
  );
});

test("rollback does not target main", () => {
  assert.throws(
    () => decideTriage(input({ attempt: 3, tags: [], backup: "main" })),
    (error: unknown) => error instanceof TriageError,
  );
  assert.throws(
    () => decideTriage(input({ attempt: 3, tags: [], backup: "refs/heads/main" })),
    (error: unknown) => error instanceof TriageError,
  );
  const tagged = decideTriage(input({ attempt: 3, tags: ["hh-good-p1"], backup: "main" }));
  assertRollback(tagged, "hh-good-p1");
});

test("missing backup and missing tag throws", () => {
  assert.throws(
    () => decideTriage(input({ attempt: 3, tags: [], backup: "" })),
    (error: unknown) => error instanceof TriageError && !error.message.includes("HEAD~20"),
  );
  assert.throws(
    () => decideTriage(input({ attempt: 3, tags: ["hh-good-other"], backup: "   " })),
    (error: unknown) => error instanceof TriageError,
  );
  assert.throws(
    () => decideTriage(input({ attempt: 3, tags: [], backup: "HEAD~20" })),
    (error: unknown) => error instanceof TriageError && !error.message.includes("HEAD~20"),
  );
});

test("rule 3 stops with a note to edit the spec", () => {
  for (const verdict of ["crash", "build-failed", "stall"] as const) {
    for (const attempt of [1, 2, 3]) {
      const action = decideTriage(input({ rule: 3, attempt, verdict }));
      assert.equal(action.type, "stop");
      if (action.type !== "stop") continue;
      assert.match(action.note, /spec/i);
      assert.notEqual(action.note, "already green");
      assert.doesNotMatch(action.note, /!/);
    }
  }
});

test("rule 2 attempt 1 retries and attempt 2 stops", () => {
  const first = decideTriage(input({ rule: 2, attempt: 1, verdict: "crash", effort: "medium" }));
  assert.deepEqual(first, { type: "retry", effort: bumpEffort("medium").effort });

  const second = decideTriage(input({ rule: 2, attempt: 2, verdict: "build-failed" }));
  assert.equal(second.type, "stop");
  if (second.type === "stop") {
    assert.doesNotMatch(second.note, /!/);
    assert.notEqual(second.note, "already green");
  }

  const later = decideTriage(input({ rule: 2, attempt: 3, verdict: "crash" }));
  assert.equal(later.type, "stop");
});

test("two stalls in a row roll back and a third stall escalates", () => {
  const first = decideTriage(input({ verdict: "stall", attempt: 1, effort: "high", rule: 1 }));
  assert.deepEqual(first, { type: "retry", effort: bumpEffort("high").effort });

  const second = decideTriage(input({ verdict: "stall", attempt: 2, effort: "xhigh", rule: 1 }));
  assertRollback(second, "hh-good-p1");

  const third = decideTriage(input({ verdict: "stall", attempt: 3, effort: "xhigh", rule: 1 }));
  assert.equal(third.type, "escalate");
  if (third.type === "escalate") {
    assertNoSwap(third.reason);
    assert.match(third.reason, /edit the spec/i);
    assert.match(third.reason, /backup/i);
    assert.match(third.reason, /stop the drive/i);
  }
});

test("a second stall on rule 2 rolls back", () => {
  const action = decideTriage(
    input({ rule: 2, verdict: "stall", attempt: 2, tags: [], backup: BACKUP }),
  );
  assertRollback(action, BACKUP);
});

test("attempt 0 throws", () => {
  assert.throws(
    () => decideTriage(input({ attempt: 0 })),
    (error: unknown) => error instanceof TriageError && /starts at 1/.test(error.message),
  );
  assert.throws(
    () => decideTriage(input({ attempt: -1, packageFailed: true, verdict: "ok" })),
    (error: unknown) => error instanceof TriageError,
  );
  assert.throws(
    () => decideTriage(input({ attempt: 1.5 })),
    (error: unknown) => error instanceof TriageError,
  );
});

test("the tag list is not rewritten", () => {
  const tags = ["hh-good-p1", "hh-good-p0"];
  const verdict: SensorVerdict = "build-failed";
  decideTriage(input({ attempt: 3, tags, verdict }));
  assert.deepEqual(tags, ["hh-good-p1", "hh-good-p0"]);
});

test("decideTriage does not invoke git", () => {
  const source = readFileSync(fileURLToPath(new URL("../src/triage.ts", import.meta.url)), "utf8");
  assert.equal(source.includes("child_process"), false);
  assert.equal(source.includes("execFile"), false);
  assert.equal(source.includes("git push"), false);
  assert.equal(/\bspawn\s*\(/.test(source), false);
  assert.equal(source.includes("bumpEffort"), true);
  assert.equal(source.includes("SensorVerdict"), true);

  const action = decideTriage(input({ attempt: 3 }));
  assert.equal(JSON.stringify(action).toLowerCase().includes("push"), false);
});
