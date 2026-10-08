import assert from "node:assert/strict";
import { test } from "node:test";
import { renderQaReport, type QaReportInput } from "../src/report.ts";

const HEADINGS = ["## Phone", "## Accessibility", "## Weight", "## Jury", "## Overall"] as const;

const SCORES = ["Performance", "Accessibility", "Best Practices", "SEO"] as const;

function report(overrides: Partial<QaReportInput> = {}): QaReportInput {
  return {
    phone: overrides.phone ?? { status: "PASS", reasons: [] },
    a11y: overrides.a11y ?? { status: "PASS", notes: [] },
    weight: overrides.weight ?? { status: "PASS", reasons: [] },
    juryStatus: overrides.juryStatus ?? "PASS",
    juryTotal: overrides.juryTotal ?? 86.5,
  };
}

function words(markdown: string): number {
  const trimmed = markdown.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

function between(markdown: string, start: string, end: string): string {
  const from = markdown.indexOf(start);
  const to = end.length === 0 ? markdown.length : markdown.indexOf(end, from + start.length);
  assert.ok(from >= 0, start);
  assert.ok(to > from, end);
  return markdown.slice(from, to);
}

function assertPlain(markdown: string): void {
  assert.equal(markdown.includes("$"), false);
  assert.equal(markdown.includes("!"), false);
  assert.equal(markdown.includes("<"), false);
  assert.equal(markdown.includes("&lt;"), false);
  assert.equal(/award/i.test(markdown), false);
  assert.ok(words(markdown) < 400);
}

function assertHeadings(markdown: string): void {
  let cursor = -1;
  for (const heading of HEADINGS) {
    const at = markdown.indexOf(heading);
    assert.ok(at > cursor, heading);
    cursor = at;
  }
}

test("a passing report names the real mobile run and the four scores", () => {
  const markdown = renderQaReport(
    report({
      phone: {
        status: "PASS",
        reasons: ["Performance 96", "Accessibility 100", "Best Practices 100", "SEO 100"],
      },
      a11y: { status: "PASS", notes: ["Keyboard path is present."] },
      weight: { status: "PASS", reasons: ["Page is within the byte ceiling."] },
      juryTotal: 86.5,
    }),
  );
  const phone = between(markdown, "## Phone", "## Accessibility");
  assert.match(phone, /real mobile/);
  for (const score of SCORES) assert.ok(phone.includes(score), score);
  assert.match(phone, /Performance 96/);
  assert.match(markdown, /Total: 86\.5/);
  assert.match(between(markdown, "## Overall", ""), /Status: PASS/);
  assert.equal(between(markdown, "## Overall", "").includes("BLOCKER"), false);
  assertHeadings(markdown);
  assertPlain(markdown);
});

test("a single blocker flips overall and keeps every section", () => {
  const markdown = renderQaReport(
    report({
      weight: { status: "BLOCKER", reasons: ["Hero video is over the ceiling."] },
      juryTotal: 70,
    }),
  );
  assert.match(between(markdown, "## Phone", "## Accessibility"), /real mobile/);
  assert.match(between(markdown, "## Weight", "## Jury"), /Hero video is over the ceiling\./);
  assert.match(between(markdown, "## Overall", ""), /BLOCKER/);
  assert.match(between(markdown, "## Overall", ""), /Weight is BLOCKER\./);
  assert.match(markdown, /Total: 70\.0/);
  assert.equal(between(markdown, "## Accessibility", "## Weight").includes("no detail"), false);
  assertHeadings(markdown);
  assertPlain(markdown);
});

test("a jury fail flips overall when the other gates pass", () => {
  const markdown = renderQaReport(report({ juryStatus: "FAIL", juryTotal: 100 }));
  assert.match(between(markdown, "## Jury", "## Overall"), /Status: FAIL/);
  assert.match(markdown, /Total: 100\.0/);
  const overall = between(markdown, "## Overall", "");
  assert.match(overall, /BLOCKER/);
  assert.match(overall, /Jury is FAIL\./);
  assert.equal(overall.includes("Phone is BLOCKER"), false);
  assertHeadings(markdown);
  assertPlain(markdown);
});

test("empty blocker reasons still block and say no detail", () => {
  const markdown = renderQaReport(
    report({
      phone: { status: "BLOCKER", reasons: [] },
      juryTotal: 91,
    }),
  );
  const phone = between(markdown, "## Phone", "## Accessibility");
  assert.match(phone, /no detail/);
  assert.equal(phone.includes("real mobile"), false);
  assert.match(between(markdown, "## Overall", ""), /BLOCKER/);
  assert.match(between(markdown, "## Overall", ""), /Phone: no detail/);
  assert.match(markdown, /Total: 91\.0/);
  assertHeadings(markdown);
  assertPlain(markdown);
});

test("angle brackets and prices are stripped instead of escaped", () => {
  const markdown = renderQaReport(
    report({
      phone: { status: "BLOCKER", reasons: ["<script>alert(1)</script>", "<"] },
      a11y: { status: "BLOCKER", notes: ["Price is $12!"] },
      weight: { status: "PASS", reasons: ["under $2"] },
      juryTotal: 64.2,
    }),
  );
  assert.match(markdown, /script>alert\(1\)\/script>/);
  assert.match(markdown, /Price is 12/);
  assert.match(markdown, /under 2/);
  assert.match(markdown, /Total: 64\.2/);
  assert.match(between(markdown, "## Overall", ""), /BLOCKER/);
  assert.equal(markdown.includes("&lt;"), false);
  assert.equal(markdown.includes("&amp;"), false);
  assertHeadings(markdown);
  assertPlain(markdown);
});
