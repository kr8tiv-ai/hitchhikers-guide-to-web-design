import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { missingRequired, type AnswerRecord } from "../src/required.ts";
import { PrdError, renderPrd } from "../src/spec/prd.ts";

const REQUIRED = ["DP-2.1", "DP-2.6", "DP-2.2", "DP-5.3", "DP-6.2", "DP-9.2"] as const;

const HEADINGS = [
  "## 1. Summary",
  "## 2. Users and personas",
  "## 3. KPIs and tracking plan",
  "## 4. Positioning and messaging hierarchy",
  "## 5. Information architecture",
  "## 6. Section plan summary",
  "## 7. Functional requirements",
  "## 8. Content requirements",
  "## 9. Visual and motion requirements",
  "## 10. 3D and media requirements",
  "## 11. Non-functional requirements",
  "## 12. Tech stack decision",
  "## 13. Deploy plan",
  "## 14. Assumptions",
  "## 15. Out of scope / Version 2 list",
  "## 16. Risks",
  "## 17. Approval",
] as const;

function record(id: string, status: AnswerRecord["status"], value: string): AnswerRecord {
  return { id, status, value };
}

function filled(overrides: Partial<Record<(typeof REQUIRED)[number], AnswerRecord>> = {}): AnswerRecord[] {
  return REQUIRED.map((id) => overrides[id] ?? record(id, "ANSWERED", `${id} recorded value`));
}

function headings(markdown: string): string[] {
  return markdown.match(/^## .+$/gm) ?? [];
}

function section(markdown: string, title: string): string {
  const found = headings(markdown);
  const start = found.indexOf(title);
  assert.notEqual(start, -1, title);
  const from = markdown.indexOf(title);
  const next = found[start + 1];
  const to = next === undefined ? markdown.length : markdown.indexOf(next, from + title.length);
  return markdown.slice(from, to);
}

test("seventeen sections render in order", () => {
  const { markdown } = renderPrd({
    answers: filled(),
    brandMarkdown: "Paper and ink for a night stall.",
    name: "Night Stall",
  });
  assert.deepEqual(headings(markdown), [...HEADINGS]);
  assert.equal(headings(markdown).length, 17);
  assert.match(markdown, /^# Night Stall PRD\n/);
  assert.equal(markdown.includes("!"), false);
  assert.equal(markdown.includes("$10-20"), false);
  assert.equal(markdown.includes("$10–20"), false);
});

test("a section count other than 17 fails", () => {
  const { markdown } = renderPrd({
    answers: filled(),
    brandMarkdown: "Short brand.",
    name: "Night Stall",
  });
  const found = markdown.split(/^## /m).length - 1;
  assert.equal(found, 17);
});

test("missing required fields throw", () => {
  const answers = [record("DP-2.1", "ANSWERED", "A stall for regulars.")];
  const missing = missingRequired(answers);
  assert.deepEqual(missing, ["DP-2.6", "DP-2.2", "DP-5.3", "DP-6.2", "DP-9.2"]);
  assert.throws(
    () => renderPrd({ answers, brandMarkdown: "Paper.", name: "Stall" }),
    (error: unknown) => {
      assert.ok(error instanceof PrdError);
      assert.deepEqual([...error.missing], missing);
      assert.match(error.message, /DP-2\.6/);
      return true;
    },
  );
});

test("a blank required value throws before a PRD is returned", () => {
  const answers = filled({ "DP-9.2": record("DP-9.2", "SKIPPED", "  \n") });
  assert.deepEqual(missingRequired(answers), ["DP-9.2"]);
  assert.throws(
    () => renderPrd({ answers, brandMarkdown: "Paper.", name: "Stall" }),
    PrdError,
  );
});

test("SOFT and SKIPPED answers are assumptions, and ANSWERED answers are not", () => {
  const answers = filled({
    "DP-5.3": record("DP-5.3", "SOFT", "quiet ink, never neon"),
    "DP-6.2": record("DP-6.2", "SKIPPED", "3. ASSUMED. Polished, not a spectacle."),
  });
  answers.push(record("DP-8.2", "SKIPPED", "proof line\nsecond line"));
  answers.push(record("DP-4.1", "SKIPPED", "first guess"));
  answers.push(record("DP-4.1", "ANSWERED", "named rivals"));
  answers.push(record("DP-9.5", "SOFT", "watch the\r\ntea"));
  answers.push(record("DP-1.3", "SUGGESTED", "Bring a towel"));
  answers.push(record("DP-1.2", "IMPORTED", "ink black"));

  const { markdown } = renderPrd({
    answers,
    brandMarkdown: "Paper and ink.",
    name: "Night Stall",
  });
  const assumptions = section(markdown, "## 14. Assumptions");
  assert.match(assumptions, /SKIPPED means the value is the assumed text/);
  assert.match(assumptions, /^- DP-5\.3: quiet ink, never neon \(SOFT\)$/m);
  assert.match(assumptions, /^- DP-6\.2: 3\. ASSUMED\. Polished, not a spectacle\. \(SKIPPED\)$/m);
  assert.match(assumptions, /^- DP-8\.2: proof line second line \(SKIPPED\)$/m);
  assert.match(assumptions, /^- DP-9\.5: watch the tea \(SOFT\)$/m);
  assert.doesNotMatch(assumptions, /\(ASSUMED\)/);
  assert.doesNotMatch(assumptions, /DP-2\.1/);
  assert.doesNotMatch(assumptions, /DP-4\.1/);
  assert.doesNotMatch(assumptions, /Bring a towel/);
  assert.doesNotMatch(assumptions, /ink black/);
  assert.match(section(markdown, "## 1. Summary"), /DP-2\.1 recorded value/);
});

test("a SOFT DP-5.3 is listed under Assumptions and the vibe is not treated as decided", () => {
  const vibe = "quiet ink, never neon";
  const { markdown } = renderPrd({
    answers: filled({ "DP-5.3": record("DP-5.3", "SOFT", vibe) }),
    brandMarkdown: "Paper, ink, and a tin of tea.",
    name: "Night Stall",
  });
  const assumptions = section(markdown, "## 14. Assumptions");
  assert.match(assumptions, new RegExp(`^- DP-5\\.3: ${vibe} \\(SOFT\\)$`, "m"));
  const outside = markdown.replace(assumptions, "");
  assert.equal(outside.includes(vibe), false);
  assert.match(section(markdown, "## 9. Visual and motion requirements"), /Vibe is not settled \(SOFT\)/);
  assert.doesNotMatch(markdown, /vibe was decided/i);
  assert.doesNotMatch(markdown, /decided vibe/i);
});

test("the non-functional section states the real mobile floor of 90", () => {
  const { markdown } = renderPrd({
    answers: filled(),
    brandMarkdown: "Paper.",
    name: "Night Stall",
  });
  const nfr = section(markdown, "## 11. Non-functional requirements");
  assert.match(nfr, /\b90\b/);
  assert.match(nfr, /real mobile/);
  assert.match(nfr, /performance/);
  assert.match(nfr, /accessibility/);
  assert.match(nfr, /best practices/);
  assert.match(nfr, /SEO/);
  assert.match(nfr, /WCAG 2\.2 AA/);
  assert.match(nfr, /current-minus-two browsers/);
});

test("approval stays pending and a full Shopify store stays out of scope", () => {
  const { markdown } = renderPrd({
    answers: filled(),
    brandMarkdown: "Paper.",
    name: "Night Stall",
  });
  assert.match(section(markdown, "## 17. Approval"), /^PRD approval: pending$/m);
  assert.doesNotMatch(markdown, /PRD approval: approved/);
  assert.match(
    section(markdown, "## 15. Out of scope / Version 2 list"),
    /A full Shopify store is out unless a later escalation says otherwise\./,
  );
  const motion = section(markdown, "## 9. Visual and motion requirements");
  assert.match(motion, /The toolkit is chosen per effect in MOTION\.md and is not a library dump on every page\./);
});

test("brand markdown over 120 words is cut on a word boundary and points at BRAND.md", () => {
  const head = Array.from({ length: 119 }, (_, index) => `w${index + 1}`);
  const brand = [...head, "KEEPWORD", "TAILWORD"].join(" ");
  const { markdown } = renderPrd({
    answers: filled(),
    brandMarkdown: brand,
    name: "Night Stall",
  });
  const positioning = section(markdown, "## 4. Positioning and messaging hierarchy");
  assert.match(positioning, /\bKEEPWORD\b/);
  assert.doesNotMatch(positioning, /TAILWORD/);
  assert.match(positioning, /stops at 120 words, on a word boundary/);
  assert.match(positioning, /\.hitchhiker\/BRAND\.md/);
  assert.equal(headings(markdown).length, 17);
});

test("a brand file of 120 words is kept whole, and a heading in the excerpt adds no section", () => {
  const words = ["##", "Positioning", ...Array.from({ length: 118 }, (_, index) => `w${index + 1}`)];
  assert.equal(words.length, 120);
  const { markdown } = renderPrd({
    answers: filled(),
    brandMarkdown: `${words.join(" ")}\n`,
    name: "Night Stall",
  });
  const positioning = section(markdown, "## 4. Positioning and messaging hierarchy");
  assert.match(positioning, /Brand excerpt: ## Positioning/);
  assert.match(positioning, /\bw118\b/);
  assert.match(positioning, /The excerpt is the full brand file\./);
  assert.match(positioning, /\.hitchhiker\/BRAND\.md/);
  assert.equal(headings(markdown).length, 17);
});

test("an empty assumption list still documents SKIPPED, and the function is pure", () => {
  const answers = filled();
  answers.push(record("DP-2.3", "ANSWERED", "portfolio"));
  const input = {
    answers,
    brandMarkdown: "",
    name: "Night Stall",
  };
  const first = renderPrd(input);
  const second = renderPrd(input);
  assert.deepEqual(first, second);
  const assumptions = section(first.markdown, "## 14. Assumptions");
  assert.match(assumptions, /SKIPPED means the value is the assumed text/);
  assert.match(assumptions, /No skipped or soft fields are on record/);
  assert.doesNotMatch(assumptions, /^- /m);
  const kpis = section(first.markdown, "## 3. KPIs and tracking plan");
  assert.match(kpis, /portfolio: Inquiries and time spent with the work/);
  assert.doesNotMatch(kpis, /%/);
  assert.doesNotMatch(first.markdown, /\bconversion\b/i);
  assert.match(section(first.markdown, "## 4. Positioning and messaging hierarchy"), /no words yet/);
});

test("an exclamation mark in an answer or the brand file is not copied", () => {
  const { markdown } = renderPrd({
    answers: filled({
      "DP-2.1": record("DP-2.1", "ANSWERED", "Find the tea!"),
      "DP-6.2": record("DP-6.2", "SKIPPED", "Calm motion!\r\nKeep it."),
    }),
    brandMarkdown: "Bright! paper",
    name: "Stall!",
  });
  assert.equal(markdown.includes("!"), false);
  assert.match(markdown, /Find the tea/);
  assert.match(section(markdown, "## 14. Assumptions"), /^- DP-6\.2: Calm motion Keep it\. \(SKIPPED\)$/m);
  assert.match(markdown, /^# Stall PRD\n/);
  assert.match(section(markdown, "## 4. Positioning and messaging hierarchy"), /Brand excerpt: Bright paper/);
});

test("renderPrd calls missingRequired and quotes BRAND.md without touching the file system", () => {
  const source = readFileSync(new URL("../src/spec/prd.ts", import.meta.url), "utf8");
  assert.match(source, /missingRequired\(/);
  assert.match(source, /\.hitchhiker\/BRAND\.md/);
  assert.equal(source.includes("node:fs"), false);
  assert.equal(source.includes("node:child_process"), false);
});
