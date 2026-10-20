import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { defaultConfig } from "@hitchhiker/engine";
import {
  CLS_MAX,
  GLB_BUDGET_BYTES,
  INP_MAX_MS,
  LCP_MAX_MS,
  VIDEO_BUDGET_BYTES,
  WEBGL_CONTEXT_MAX,
  evaluatePerformance,
  type PerformanceInput,
} from "../src/performance-gate.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const floors = defaultConfig().gates;

function report(overrides: { performance?: number; accessibility?: number; lcp?: number; inp?: number; cls?: number } = {}): {
  categories: Record<string, { score: number }>;
  audits: Record<string, { numericValue: number }>;
} {
  return {
    categories: {
      performance: { score: overrides.performance ?? 0.95 },
      accessibility: { score: overrides.accessibility ?? 0.96 },
      "best-practices": { score: 0.95 },
      seo: { score: 0.97 },
    },
    audits: {
      "largest-contentful-paint": { numericValue: overrides.lcp ?? 1800 },
      "interaction-to-next-paint": { numericValue: overrides.inp ?? 80 },
      "cumulative-layout-shift": { numericValue: overrides.cls ?? 0.02 },
    },
  };
}

function input(patch: Partial<PerformanceInput> = {}): PerformanceInput {
  return {
    lighthouse: report(),
    floors,
    heavy: true,
    webglContexts: 1,
    glbBytes: 2_000_000,
    videoBytes: 3_000_000,
    mobileStill: true,
    animates: true,
    reducedMotionComplete: true,
    ...patch,
  };
}

test("the hard budgets match the locked vitals and media weights", () => {
  assert.equal(LCP_MAX_MS, 2500);
  assert.equal(INP_MAX_MS, 200);
  assert.equal(CLS_MAX, 0.1);
  assert.equal(VIDEO_BUDGET_BYTES, 4 * 1024 * 1024);
  assert.equal(GLB_BUDGET_BYTES, 5 * 1024 * 1024);
  assert.equal(WEBGL_CONTEXT_MAX, 1);
});

test("a stubbed mobile run inside every budget passes", () => {
  const result = evaluatePerformance(input());
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.reasons, []);
});

test("a phone performance score under 90 is a blocker", () => {
  const under = evaluatePerformance(input({ lighthouse: report({ performance: 0.89 }) }));
  assert.equal(under.status, "BLOCKER");
  assert.match(under.reasons.join(" "), /performance/i);
  assert.equal(evaluatePerformance(input({ lighthouse: report({ performance: 0.9 }) })).status, "PASS");
  const a11y = evaluatePerformance(input({ lighthouse: report({ accessibility: 0.8 }) }));
  assert.equal(a11y.status, "BLOCKER");
  assert.match(a11y.reasons.join(" "), /accessibility/i);
});

test("LCP, INP, and CLS fail one step past the limit and pass on the limit", () => {
  assert.equal(evaluatePerformance(input({ lighthouse: report({ lcp: LCP_MAX_MS }) })).status, "PASS");
  const lcp = evaluatePerformance(input({ lighthouse: report({ lcp: LCP_MAX_MS + 1 }) }));
  assert.equal(lcp.status, "BLOCKER");
  assert.match(lcp.reasons.join(" "), /LCP/);

  assert.equal(evaluatePerformance(input({ lighthouse: report({ inp: INP_MAX_MS }) })).status, "PASS");
  const inp = evaluatePerformance(input({ lighthouse: report({ inp: INP_MAX_MS + 1 }) }));
  assert.equal(inp.status, "BLOCKER");
  assert.match(inp.reasons.join(" "), /INP/);

  assert.equal(evaluatePerformance(input({ lighthouse: report({ cls: CLS_MAX }) })).status, "PASS");
  const cls = evaluatePerformance(input({ lighthouse: report({ cls: 0.11 }) }));
  assert.equal(cls.status, "BLOCKER");
  assert.match(cls.reasons.join(" "), /CLS/);
});

test("a missing mobile run or a missing vital is a blocker", () => {
  const missing = evaluatePerformance(input({ lighthouse: null, webglContexts: 0, glbBytes: 0, videoBytes: 0, mobileStill: false, animates: false, reducedMotionComplete: false }));
  assert.equal(missing.status, "BLOCKER");
  assert.match(missing.reasons.join(" "), /A real mobile run is required/);

  const noLcp = report();
  delete noLcp.audits["largest-contentful-paint"];
  const lcp = evaluatePerformance(input({ lighthouse: noLcp }));
  assert.equal(lcp.status, "BLOCKER");
  assert.match(lcp.reasons.join(" "), /LCP was not measured/);

  const noInp = report();
  delete noInp.audits["interaction-to-next-paint"];
  const inp = evaluatePerformance(input({ lighthouse: noInp }));
  assert.equal(inp.status, "BLOCKER");
  assert.match(inp.reasons.join(" "), /INP was not measured/);

  const experimental = report();
  delete experimental.audits["interaction-to-next-paint"];
  experimental.audits["experimental-interaction-to-next-paint"] = { numericValue: 120 };
  assert.equal(evaluatePerformance(input({ lighthouse: experimental })).status, "PASS");

  const noCls = report();
  delete noCls.audits["cumulative-layout-shift"];
  const cls = evaluatePerformance(input({ lighthouse: noCls }));
  assert.equal(cls.status, "BLOCKER");
  assert.match(cls.reasons.join(" "), /CLS was not measured/);
});

test("3D and video pass on the byte budget and fail one byte over", () => {
  assert.equal(evaluatePerformance(input({ glbBytes: GLB_BUDGET_BYTES })).status, "PASS");
  const glb = evaluatePerformance(input({ glbBytes: GLB_BUDGET_BYTES + 1 }));
  assert.equal(glb.status, "BLOCKER");
  assert.match(glb.reasons.join(" "), /3D|glb/i);

  assert.equal(evaluatePerformance(input({ videoBytes: VIDEO_BUDGET_BYTES })).status, "PASS");
  const video = evaluatePerformance(input({ videoBytes: VIDEO_BUDGET_BYTES + 1 }));
  assert.equal(video.status, "BLOCKER");
  assert.match(video.reasons.join(" "), /video/i);
});

test("one WebGL context needs a mobile still, and a second context fails", () => {
  const two = evaluatePerformance(input({ webglContexts: 2 }));
  assert.equal(two.status, "BLOCKER");
  assert.match(two.reasons.join(" "), /WebGL/);

  const bare = evaluatePerformance(input({ webglContexts: 1, glbBytes: 0, videoBytes: 0, mobileStill: false }));
  assert.equal(bare.status, "BLOCKER");
  assert.match(bare.reasons.join(" "), /still/i);

  const quiet = evaluatePerformance(input({
    webglContexts: 0,
    glbBytes: 0,
    videoBytes: 0,
    mobileStill: false,
    animates: false,
    reducedMotionComplete: false,
    heavy: false,
  }));
  assert.equal(quiet.status, "PASS");
});

test("an animating page without a complete reduced-motion branch fails", () => {
  const moving = evaluatePerformance(input({ animates: true, reducedMotionComplete: false }));
  assert.equal(moving.status, "BLOCKER");
  assert.match(moving.reasons.join(" "), /reduced-motion/i);
  const still = evaluatePerformance(input({
    webglContexts: 0,
    glbBytes: 0,
    videoBytes: 0,
    mobileStill: false,
    animates: false,
    reducedMotionComplete: false,
    heavy: false,
  }));
  assert.equal(still.status, "PASS");
});

test("a floor below 90 and a corrupt count throw", () => {
  assert.throws(
    () =>
      evaluatePerformance(
        input({
          floors: {
            phonePerfMin: 70,
            a11yMin: floors.a11yMin,
            bestPracticesMin: floors.bestPracticesMin,
            seoMin: floors.seoMin,
          },
        }),
      ),
    /90/,
  );
  assert.throws(() => evaluatePerformance(input({ webglContexts: -1 })), /webgl/i);
  assert.throws(() => evaluatePerformance(input({ glbBytes: Number.NaN })), /glb/i);
  assert.throws(() => evaluatePerformance(input({ videoBytes: -1 })), /video/i);
});

test("the performance gate reads a stub and does not launch Lighthouse", () => {
  const source = readFileSync(path.join(here, "..", "src", "performance-gate.ts"), "utf8");
  assert.match(source, /export function evaluatePerformance/);
  assert.match(source, /evaluateLh/);
  assert.doesNotMatch(source, /child_process|playwright|@lhci|lhci-run|chrome/i);
});
