import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSuccessfulHeadlessResult,
  resolveHeadlessTimeoutMs,
  resolveLiveWorkflowOutputFormat,
  type LiveWorkflowScenario,
} from "./scenario.ts";

function withEnv(t: { after: (fn: () => void) => void }, overrides: Record<string, string | undefined>): void {
  const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function scenario(command: "next" | "auto", timeoutMs: number): LiveWorkflowScenario {
  return {
    slug: "timeout-selection",
    seed: () => ({}),
    dispatch: { command, timeoutMs },
  };
}

test("auto scenarios keep headless overall timeout disabled by default", (t) => {
  withEnv(t, { GSD_LIVE_WORKFLOW_TIMEOUT_MS: undefined });

  assert.equal(resolveHeadlessTimeoutMs(scenario("auto", 1_800_000)), 0);
  assert.equal(resolveHeadlessTimeoutMs(scenario("next", 300_000)), 300_000);
});

test("operator timeout override remains authoritative for auto scenarios", (t) => {
  withEnv(t, { GSD_LIVE_WORKFLOW_TIMEOUT_MS: "900000" });

  assert.equal(resolveHeadlessTimeoutMs(scenario("auto", 1_800_000)), 900_000);
});

test("live workflows use structured output by default and allow an explicit text override", (t) => {
  withEnv(t, { GSD_LIVE_WORKFLOW_OUTPUT: undefined });
  assert.equal(resolveLiveWorkflowOutputFormat(), "stream-json");

  process.env.GSD_LIVE_WORKFLOW_OUTPUT = "text";
  assert.equal(resolveLiveWorkflowOutputFormat(), "text");
});

test("structured success ignores failure words in ordinary notifications", () => {
  assert.doesNotThrow(() =>
    assertSuccessfulHeadlessResult([
      {
        type: "extension_ui_request",
        method: "notify",
        message: "Committed: fix blocked error handling",
      },
      { type: "headless_result", status: "success", exitCode: 0 },
    ]),
  );
});

test("structured blocked and missing results fail loudly", () => {
  assert.throws(
    () => assertSuccessfulHeadlessResult([{ type: "headless_result", status: "blocked", exitCode: 10 }]),
    /status=blocked, exitCode=10/,
  );
  assert.throws(() => assertSuccessfulHeadlessResult([]), /missing headless_result/);
});
