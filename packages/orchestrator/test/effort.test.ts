import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { Effort } from "@hitchhiker/engine";
import { EffortError, bumpEffort, effortForTier } from "../src/effort.ts";
import { buildArgv, type RunRequest } from "../src/runner.ts";

const TIERS: readonly { tier: string; effort: Effort }[] = [
  { tier: "Towel", effort: "medium" },
  { tier: "Cup of Tea", effort: "medium" },
  { tier: "Gargle Blaster", effort: "high" },
  { tier: "Heart of Gold", effort: "high" },
  { tier: "Forty-Two", effort: "xhigh" },
];

const LEGAL = ["medium", "high", "xhigh"] as const;

function ready(effort: Effort): RunRequest {
  return {
    model: "grok-4.7",
    cwd: path.join(os.tmpdir(), "towel-site"),
    promptText: "Build the hero.",
    bin: "grok",
    promptPath: path.join(os.tmpdir(), "towel-site", "prompts", "042.md"),
    effort,
    maxTurns: 24,
    sessionMode: "uuid",
    sessionId: "11111111-1111-4111-8111-111111111111",
    approved: true,
  };
}

function flag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  return argv[index + 1];
}

test("each tier maps to a legal effort", () => {
  for (const row of TIERS) {
    const effort = effortForTier(row.tier);
    assert.equal(effort, row.effort);
    assert.ok(LEGAL.includes(effort));
  }
});

test("tier match is exact, including spaces in Cup of Tea", () => {
  assert.equal(effortForTier("Cup of Tea"), "medium");
  assert.throws(() => effortForTier("Cup of tea"), EffortError);
  assert.throws(() => effortForTier("cup of tea"), EffortError);
  assert.throws(() => effortForTier("Cup  of Tea"), EffortError);
  assert.throws(() => effortForTier("Towel "), EffortError);
  assert.throws(() => effortForTier("Babel Fish"), EffortError);
});

test("null tier throws", () => {
  assert.throws(() => effortForTier(null as unknown as string), EffortError);
  assert.throws(() => effortForTier(undefined as unknown as string), EffortError);
});

test("bump from medium is high uncapped, from high is xhigh uncapped, from xhigh is xhigh capped", () => {
  assert.deepEqual(bumpEffort("medium"), { effort: "high", capped: false });
  assert.deepEqual(bumpEffort("high"), { effort: "xhigh", capped: false });
  assert.deepEqual(bumpEffort("xhigh"), { effort: "xhigh", capped: true });
});

test("five bumps from medium end at xhigh capped", () => {
  let effort: Effort = "medium";
  const seen: { effort: Effort; capped: boolean }[] = [];
  for (let step = 0; step < 5; step += 1) {
    const next = bumpEffort(effort);
    seen.push(next);
    effort = next.effort;
  }
  assert.deepEqual(seen, [
    { effort: "high", capped: false },
    { effort: "xhigh", capped: false },
    { effort: "xhigh", capped: true },
    { effort: "xhigh", capped: true },
    { effort: "xhigh", capped: true },
  ]);
  const last = seen[seen.length - 1];
  assert.ok(last !== undefined);
  assert.equal(last.effort, "xhigh");
  assert.equal(last.capped, true);
});

test("three failures do not produce a fourth effort name", () => {
  const names = new Set<string>();
  let effort = effortForTier("Towel");
  names.add(effort);
  for (let failure = 0; failure < 3; failure += 1) {
    const next = bumpEffort(effort);
    names.add(next.effort);
    effort = next.effort;
    assert.ok(LEGAL.includes(next.effort));
  }
  assert.deepEqual([...names].sort(), ["high", "medium", "xhigh"]);
  assert.equal(names.has("ultra"), false);
  assert.equal(names.has("max"), false);
  assert.equal(names.size, 3);

  let capped = effortForTier("Forty-Two");
  for (let failure = 0; failure < 3; failure += 1) {
    const next = bumpEffort(capped);
    assert.equal(next.effort, "xhigh");
    assert.equal(next.capped, true);
    capped = next.effort;
    names.add(capped);
  }
  assert.equal(names.size, 3);
});

test("an effort outside the three names throws", () => {
  assert.throws(() => bumpEffort("ultra" as Effort), EffortError);
  assert.throws(() => bumpEffort("max" as Effort), EffortError);
  assert.throws(() => bumpEffort("low" as Effort), EffortError);
});

test("Forty-Two produces xhigh in argv via buildArgv", () => {
  const effort = effortForTier("Forty-Two");
  assert.equal(effort, "xhigh");
  const argv = buildArgv(ready(effort));
  assert.equal(flag(argv, "--effort"), "xhigh");
  assert.equal(argv.includes("ultra"), false);
  assert.equal(argv.includes("max"), false);
});
