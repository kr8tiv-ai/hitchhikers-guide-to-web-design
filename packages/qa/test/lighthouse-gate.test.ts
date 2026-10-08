import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { defaultConfig } from "@hitchhiker/engine";
import { evaluateLh, fromLhci, type LhFloors, type LhScores } from "../src/lighthouse-gate.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

function floors(overrides: Partial<LhFloors> = {}): LhFloors {
  const gates = defaultConfig().gates;
  return {
    phonePerfMin: overrides.phonePerfMin ?? gates.phonePerfMin,
    a11yMin: overrides.a11yMin ?? gates.a11yMin,
    bestPracticesMin: overrides.bestPracticesMin ?? gates.bestPracticesMin,
    seoMin: overrides.seoMin ?? gates.seoMin,
  };
}

function scores(overrides: Partial<LhScores> = {}): LhScores {
  return {
    performance: overrides.performance ?? 90,
    accessibility: overrides.accessibility ?? 90,
    bestPractices: overrides.bestPractices ?? 90,
    seo: overrides.seo ?? 90,
  };
}

function fixture(points: LhScores): {
  categories: Record<string, { score: number }>;
} {
  return {
    categories: {
      performance: { score: points.performance },
      accessibility: { score: points.accessibility },
      "best-practices": { score: points.bestPractices },
      seo: { score: points.seo },
    },
  };
}

test("GuideConfig gate defaults are 90 for every phone category", () => {
  const gates = defaultConfig().gates;
  assert.equal(gates.phonePerfMin, 90);
  assert.equal(gates.a11yMin, 90);
  assert.equal(gates.bestPracticesMin, 90);
  assert.equal(gates.seoMin, 90);
});

test("phone scores at the config floors pass", () => {
  const result = evaluateLh({
    phone: scores(),
    heavy: false,
    floors: defaultConfig().gates,
  });
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.reasons, []);
});

test("a performance ratio of 0.9 passes and 90 is not scaled again", () => {
  const ratio = evaluateLh({
    phone: scores({ performance: 0.9, accessibility: 1, bestPractices: 1, seo: 1 }),
    heavy: false,
    floors: floors(),
  });
  const points = evaluateLh({
    phone: scores({ performance: 90 }),
    heavy: false,
    floors: floors(),
  });
  assert.equal(ratio.status, "PASS");
  assert.equal(points.status, "PASS");
});

test("phone performance 89 fails and 90 passes when the other three are at least 90", () => {
  const failed = evaluateLh({
    phone: scores({ performance: 89, accessibility: 100, bestPractices: 100, seo: 100 }),
    heavy: false,
    floors: floors(),
  });
  const passed = evaluateLh({
    phone: scores({ performance: 90, accessibility: 100, bestPractices: 100, seo: 100 }),
    heavy: false,
    floors: floors(),
  });
  assert.equal(failed.status, "BLOCKER");
  assert.deepEqual(failed.reasons, ["Phone performance is 89, below the floor of 90."]);
  assert.equal(passed.status, "PASS");
  assert.deepEqual(passed.reasons, []);
});

test("phone accessibility 89 fails", () => {
  const result = evaluateLh({
    phone: scores({ accessibility: 89 }),
    heavy: false,
    floors: floors(),
  });
  assert.equal(result.status, "BLOCKER");
  assert.deepEqual(result.reasons, ["Phone accessibility is 89, below the floor of 90."]);
});

test("phone best practices 89 fails", () => {
  const result = evaluateLh({
    phone: scores({ bestPractices: 89 }),
    heavy: false,
    floors: floors(),
  });
  assert.equal(result.status, "BLOCKER");
  assert.deepEqual(result.reasons, ["Phone best practices is 89, below the floor of 90."]);
});

test("phone SEO 89 fails", () => {
  const result = evaluateLh({
    phone: scores({ seo: 89 }),
    heavy: false,
    floors: floors(),
  });
  assert.equal(result.status, "BLOCKER");
  assert.deepEqual(result.reasons, ["Phone SEO is 89, below the floor of 90."]);
});

test("a ratio under 0.9 fails the matching phone category", () => {
  const result = evaluateLh({
    phone: scores({ performance: 0.89, accessibility: 0.9, bestPractices: 0.9, seo: 0.9 }),
    heavy: false,
    floors: floors(),
  });
  assert.equal(result.status, "BLOCKER");
  assert.deepEqual(result.reasons, ["Phone performance is 89, below the floor of 90."]);
});

test("desktop performance 40 does not fail a passing phone run and is informational", () => {
  const result = evaluateLh({
    phone: scores({ performance: 92, accessibility: 95, bestPractices: 96, seo: 97 }),
    desktop: scores({ performance: 40, accessibility: 91, bestPractices: 92, seo: 93 }),
    heavy: false,
    floors: floors(),
  });
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.reasons, [
    "Desktop is informational: performance 40, accessibility 91, best practices 92, SEO 93. A desktop run does not waive the phone.",
  ]);
});

test("a low desktop accessibility score does not waive or fail the phone", () => {
  const result = evaluateLh({
    phone: scores(),
    desktop: scores({ performance: 40, accessibility: 40, bestPractices: 40, seo: 40 }),
    heavy: true,
    floors: floors(),
  });
  assert.equal(result.status, "PASS");
  const text = result.reasons.join("\n");
  assert.match(text, /performance 40/);
  assert.match(text, /informational/);
  assert.match(text, /does not waive the phone/);
  assert.match(text, /phone fallback/);
});

test("a missing phone run is a blocker", () => {
  const result = evaluateLh({
    phone: null,
    heavy: true,
    floors: floors(),
  });
  assert.equal(result.status, "BLOCKER");
  assert.match(result.reasons.join("\n"), /A real mobile run is required/);
  assert.match(result.reasons.join("\n"), /missing phone fallback/i);
});

test("heavy false and phone null is still a blocker", () => {
  const result = evaluateLh({
    phone: null,
    desktop: scores({ performance: 100, accessibility: 100, bestPractices: 100, seo: 100 }),
    heavy: false,
    floors: floors(),
  });
  assert.equal(result.status, "BLOCKER");
  assert.deepEqual(result.reasons, [
    "A real mobile run is required.",
    "Desktop is informational: performance 100, accessibility 100, best practices 100, SEO 100. A desktop run does not waive the phone.",
  ]);
});

test("an omitted phone property is a blocker", () => {
  const result = evaluateLh({
    phone: undefined as unknown as null,
    heavy: false,
    floors: floors(),
  });
  assert.equal(result.status, "BLOCKER");
  assert.match(result.reasons[0] ?? "", /A real mobile run is required/);
});

test("desktop null is the same as omitting the desktop run", () => {
  const result = evaluateLh({
    phone: scores(),
    desktop: null,
    heavy: false,
    floors: floors(),
  });
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.reasons, []);
});

test("every failing phone category is listed", () => {
  const result = evaluateLh({
    phone: scores({ performance: 89, accessibility: 88, bestPractices: 87, seo: 86 }),
    desktop: scores({ performance: 40 }),
    heavy: false,
    floors: floors(),
  });
  assert.equal(result.status, "BLOCKER");
  assert.deepEqual(result.reasons, [
    "Phone performance is 89, below the floor of 90.",
    "Phone accessibility is 88, below the floor of 90.",
    "Phone best practices is 87, below the floor of 90.",
    "Phone SEO is 86, below the floor of 90.",
    "Desktop is informational: performance 40, accessibility 90, best practices 90, SEO 90. A desktop run does not waive the phone.",
  ]);
});

test("a floor of 95 is applied and a floor of 70 is rejected", () => {
  const tight = evaluateLh({
    phone: scores({ performance: 94, accessibility: 95, bestPractices: 95, seo: 95 }),
    heavy: false,
    floors: floors({ phonePerfMin: 95 }),
  });
  const met = evaluateLh({
    phone: scores({ performance: 95 }),
    heavy: false,
    floors: floors({ phonePerfMin: 95, a11yMin: 90, bestPracticesMin: 100, seoMin: 90 }),
  });
  assert.equal(tight.status, "BLOCKER");
  assert.deepEqual(tight.reasons, ["Phone performance is 94, below the floor of 95."]);
  assert.equal(met.status, "BLOCKER");
  assert.deepEqual(met.reasons, ["Phone best practices is 90, below the floor of 100."]);
  assert.throws(
    () =>
      evaluateLh({
        phone: scores({ performance: 100 }),
        heavy: false,
        floors: floors({ phonePerfMin: 70 }),
      }),
    /floors\.phonePerfMin is 70\. Floors below 90 are rejected\./,
  );
});

test("accessibility, best practices, and SEO floors below 90 are rejected", () => {
  for (const key of ["a11yMin", "bestPracticesMin", "seoMin"] as const) {
    assert.throws(
      () =>
        evaluateLh({
          phone: scores(),
          heavy: false,
          floors: floors({ [key]: 89 }),
        }),
      new RegExp(`floors\\.${key} is 89\\. Floors below 90 are rejected\\.`),
    );
  }
});

test("scores above 100 throw and negative scores throw", () => {
  assert.throws(
    () =>
      evaluateLh({
        phone: scores({ performance: 101 }),
        heavy: false,
        floors: floors(),
      }),
    /phone\.performance is 101\. Scores above 100 throw\./,
  );
  assert.throws(
    () =>
      evaluateLh({
        phone: scores({ seo: 100.01 }),
        heavy: false,
        floors: floors(),
      }),
    /Scores above 100 throw/,
  );
  assert.throws(
    () =>
      evaluateLh({
        phone: scores(),
        desktop: scores({ accessibility: -1 }),
        heavy: false,
        floors: floors(),
      }),
    /desktop\.accessibility is -1\. Negative scores throw\./,
  );
  assert.throws(
    () =>
      evaluateLh({
        phone: scores({ bestPractices: -0.01 }),
        heavy: false,
        floors: floors(),
      }),
    /Negative scores throw/,
  );
});

test("a non-finite score throws", () => {
  assert.throws(
    () =>
      evaluateLh({
        phone: scores({ performance: Number.NaN }),
        heavy: false,
        floors: floors(),
      }),
    /phone\.performance is NaN/,
  );
  assert.throws(
    () =>
      evaluateLh({
        phone: scores({ seo: Number.POSITIVE_INFINITY }),
        heavy: false,
        floors: floors(),
      }),
    /phone\.seo is Infinity/,
  );
});

test("a point score of 1.5 is not treated as a ratio", () => {
  const result = evaluateLh({
    phone: scores({ performance: 1.5 }),
    heavy: false,
    floors: floors(),
  });
  assert.equal(result.status, "BLOCKER");
  assert.deepEqual(result.reasons, ["Phone performance is 1.5, below the floor of 90."]);
});

test("fromLhci maps a category fixture into the phone gate", () => {
  const json = {
    categories: {
      performance: { score: 0.91 },
      accessibility: { score: 0.95 },
      "best-practices": { score: 1 },
      seo: { score: 0.9 },
    },
  };
  const phone = fromLhci(json);
  assert.equal(phone.performance, 0.91);
  assert.equal(phone.accessibility, 0.95);
  assert.equal(phone.bestPractices, 1);
  assert.equal(phone.seo, 0.9);
  const result = evaluateLh({ phone, heavy: false, floors: floors() });
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.reasons, []);
});

test("fromLhci reads an lhr wrapper and a camelCase best practices key", () => {
  const phone = fromLhci({
    lhr: fixture(scores({ performance: 0.89, accessibility: 0.92, bestPractices: 0.93, seo: 0.94 })),
  });
  assert.equal(phone.performance, 0.89);
  const camel = fromLhci({
    categories: {
      performance: { score: 90 },
      accessibility: { score: 90 },
      bestPractices: { score: 91 },
      seo: { score: 92 },
    },
  });
  assert.equal(camel.bestPractices, 91);
  const judged = evaluateLh({ phone, heavy: false, floors: floors() });
  assert.equal(judged.status, "BLOCKER");
  assert.match(judged.reasons[0] ?? "", /Phone performance is 89/);
});

test("fromLhci rejects a partial report instead of inventing scores", () => {
  assert.throws(
    () => fromLhci({ categories: { performance: { score: 0.91 } } }),
    /categories\.accessibility is missing/,
  );
  assert.throws(
    () => fromLhci({ categories: { performance: { score: null } } }),
    /score is null/,
  );
  assert.throws(() => fromLhci(null), /fromLhci json is null/);
  assert.throws(() => fromLhci([]), /fromLhci json is \[\]/);
});

test("disagreeing best-practices keys throw", () => {
  assert.throws(
    () =>
      fromLhci({
        categories: {
          performance: { score: 0.91 },
          accessibility: { score: 0.91 },
          "best-practices": { score: 0.91 },
          bestPractices: { score: 0.5 },
          seo: { score: 0.91 },
        },
      }),
    /Expected one score/,
  );
});

test("a floor above 100 and a missing floor throw", () => {
  assert.throws(
    () =>
      evaluateLh({
        phone: scores(),
        heavy: false,
        floors: floors({ seoMin: 101 }),
      }),
    /floors\.seoMin is 101\. Floors above 100 are rejected\./,
  );
  const partial = { phonePerfMin: 90, a11yMin: 90, bestPracticesMin: 90 };
  assert.throws(
    () =>
      evaluateLh({
        phone: scores(),
        heavy: false,
        floors: partial as LhFloors,
      }),
    /floors\.seoMin is missing/,
  );
});

test("the gate module does not shell out or download a browser", () => {
  const source = readFileSync(path.join(here, "..", "src", "lighthouse-gate.ts"), "utf8");
  assert.doesNotMatch(source, /node:child_process/);
  assert.doesNotMatch(source, /node:https/);
  assert.doesNotMatch(source, /@lhci\/cli/);
  assert.doesNotMatch(source, /playwright/);
  assert.doesNotMatch(source, /puppeteer/);
  assert.match(source, /GuideConfig/);
});
