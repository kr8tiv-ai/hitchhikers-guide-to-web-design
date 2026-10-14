/**
 * BUG-039: every brief requirement must map to a build task before approval.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { generateBriefPlan } from "../src/spec/brief-plan.ts";
import {
  PlanCoverageError,
  checkPlanCoverage,
  planCoverageMessage,
} from "../src/spec/plan-coverage.ts";

const REQUIREMENTS = [
  { id: "REQ-PAGE-home", label: "Home at /" },
  { id: "REQ-PAGE-farms", label: "Farms at /farms" },
  { id: "REQ-FEAT-map", label: "map" },
];

test("a plan that names every requirement is covered", () => {
  const result = checkPlanCoverage(REQUIREMENTS, [
    { requirements: ["REQ-PAGE-home"] },
    { requirements: ["REQ-PAGE-farms", "REQ-FEAT-map"] },
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.uncovered, []);
  assert.equal(planCoverageMessage(result.uncovered), "");
});

test("a plan that misses a page or a feature names each gap", () => {
  const result = checkPlanCoverage(REQUIREMENTS, [{ requirements: ["REQ-PAGE-home"] }]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.uncovered, [
    { id: "REQ-PAGE-farms", label: "Farms at /farms" },
    { id: "REQ-FEAT-map", label: "map" },
  ]);
  assert.equal(
    planCoverageMessage(result.uncovered),
    "These requirements have no build task: Farms at /farms (REQ-PAGE-farms), map (REQ-FEAT-map).",
  );
  assert.throws(
    () => {
      if (!result.ok) throw new PlanCoverageError(result.uncovered);
    },
    (error: unknown) => {
      assert.ok(error instanceof PlanCoverageError);
      assert.equal(error.message, planCoverageMessage(result.uncovered));
      assert.equal(error.uncovered.length, 2);
      return true;
    },
  );
});

test("the Paradise Found plan covers its own pages and features", () => {
  const brief = `# Site Brief

## Pages

Pages: Home; Farms (grid plus a detail page per farm); About.

## Features

A map on Farms. Filters, sort, and URL state.
`;
  const { prompts, planned } = generateBriefPlan(brief);
  const covered = checkPlanCoverage(planned.requirements, prompts);
  assert.equal(covered.ok, true, planCoverageMessage(covered.uncovered));
  assert.ok(planned.requirements.some((item) => item.id.startsWith("REQ-PAGE-")));
  assert.ok(planned.requirements.some((item) => item.id.startsWith("REQ-FEAT-")));
  const dropped = prompts.map((prompt) => ({
    requirements: prompt.requirements.filter((id) => !id.startsWith("REQ-PAGE-") && !id.startsWith("REQ-FEAT-")),
  }));
  const gap = checkPlanCoverage(planned.requirements, dropped);
  assert.equal(gap.ok, false);
  assert.ok(gap.uncovered.some((item) => item.id.startsWith("REQ-PAGE-")));
  assert.ok(gap.uncovered.some((item) => item.id.startsWith("REQ-FEAT-")));
});
