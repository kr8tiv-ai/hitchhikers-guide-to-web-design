/**
 * A missing brief must not reach brief.split. The gate and the critique
 * say the brief is missing. They do not throw and they do not pass.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { designReadyForBuild } from "../src/spec/design-stages.ts";
import { critiquePlan, draftPlan } from "../src/spec/plan-critique.ts";
import { removeTempDir } from "./remove-temp.ts";

test("designReadyForBuild and plan critique name a missing brief instead of splitting it", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-missing-brief-250a-"));
  try {
    const missing = undefined as unknown as string;
    const draft = draftPlan(missing);
    const critique = critiquePlan(draft);
    assert.equal(critique.pass, false);
    assert.match(critique.failure, /brief is missing/i);
    const gate = designReadyForBuild(dir, missing);
    assert.equal(gate.ok, false);
    assert.match(gate.reason, /brief is missing/i);
  } finally {
    removeTempDir(dir);
  }
});
