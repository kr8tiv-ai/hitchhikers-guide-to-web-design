import assert from "node:assert/strict";
import { test } from "node:test";
import { missingRequired, renderBrief } from "../src/index.ts";
import type { AnswerRecord } from "../src/index.ts";

const REQUIRED = ["DP-2.1", "DP-2.6", "DP-2.2", "DP-5.3", "DP-6.2", "DP-9.2"] as const;

const MOTION_ASSUMED = "3. ASSUMED. Polished, not a spectacle.";

function record(
  id: string,
  status: AnswerRecord["status"],
  value: string,
): AnswerRecord {
  return { id, status, value };
}

function filled(overrides: Partial<Record<(typeof REQUIRED)[number], AnswerRecord>> = {}): AnswerRecord[] {
  return REQUIRED.map((id) => overrides[id] ?? record(id, "ANSWERED", `${id} value`));
}

test("a complete set of non-empty required answers is not missing", () => {
  assert.deepEqual(missingRequired(filled()), []);
});

test("a skip of DP-6.2 with the assumed sentence is not missing", () => {
  const answers = filled({
    "DP-6.2": record("DP-6.2", "SKIPPED", MOTION_ASSUMED),
  });
  assert.equal(missingRequired(answers).includes("DP-6.2"), false);
  assert.deepEqual(missingRequired(answers), []);
});

test("a skip of DP-6.2 with a blank is missing", () => {
  const answers = filled({
    "DP-6.2": record("DP-6.2", "SKIPPED", " "),
  });
  assert.deepEqual(missingRequired(answers), ["DP-6.2"]);
});

test("empty values never count, and SOFT with text does", () => {
  const blanks = REQUIRED.map((id) => record(id, "ANSWERED", ""));
  assert.deepEqual(missingRequired(blanks), [...REQUIRED]);

  const suggested = filled({
    "DP-2.1": record("DP-2.1", "SUGGESTED", "Sell the tour."),
    "DP-2.6": record("DP-2.6", "IMPORTED", ""),
    "DP-5.3": record("DP-5.3", "SOFT", "quiet ink, never loud"),
  });
  assert.deepEqual(missingRequired(suggested), ["DP-2.6"]);
});

test("a missing id is required, and DP-7.2 is not", () => {
  const withoutHosting = filled().filter((answer) => answer.id !== "DP-9.2");
  withoutHosting.push(record("DP-7.2", "SKIPPED", " "));
  assert.deepEqual(missingRequired(withoutHosting), ["DP-9.2"]);
});

test("the last record for an id wins", () => {
  const answers = filled();
  answers.push(record("DP-9.2", "ANSWERED", "   "));
  assert.deepEqual(missingRequired(answers), ["DP-9.2"]);
  answers.push(record("DP-9.2", "IMPORTED", "Hostinger"));
  assert.deepEqual(missingRequired(answers), []);
});

test("renderBrief contains ASSUMED when the motion answer is SKIPPED", () => {
  const brief = renderBrief(
    filled({
      "DP-6.2": record("DP-6.2", "SKIPPED", MOTION_ASSUMED),
    }),
  );
  assert.match(brief, /ASSUMED/);
  assert.match(brief, new RegExp(MOTION_ASSUMED.replace(/[.]/g, "\\.")));
  const motionAt = brief.indexOf("## Motion");
  const hostingAt = brief.indexOf("## Hosting");
  assert.ok(motionAt >= 0);
  assert.ok(motionAt < brief.indexOf(MOTION_ASSUMED));
  assert.ok(brief.indexOf(MOTION_ASSUMED) < hostingAt);
});

test("renderBrief writes the six headings, prefixes SOFT, and counts coverage", () => {
  const answers: AnswerRecord[] = [
    record("DP-2.1", "ANSWERED", "Book the tasting."),
    record("DP-2.6", "ANSWERED", "A local cook on a phone."),
    record("DP-2.2", "SUGGESTED", "Reserve a seat."),
    record("DP-5.3", "SOFT", "quiet ink, never loud"),
    record("DP-6.2", "SKIPPED", MOTION_ASSUMED),
    record("DP-9.2", "IMPORTED", "no idea"),
    record("DP-7.2", "ANSWERED", "No custom 3D."),
  ];
  const brief = renderBrief(answers);
  const headings = ["## Goal", "## Visitor", "## Action", "## Vibe", "## Motion", "## Hosting"];
  let cursor = brief.indexOf("# Site Brief");
  assert.ok(cursor >= 0);
  for (const heading of headings) {
    const at = brief.indexOf(heading, cursor);
    assert.ok(at > cursor, heading);
    cursor = at + heading.length;
  }
  assert.match(brief, /SOFT: quiet ink, never loud/);
  assert.match(
    brief,
    /Coverage: 3 answered, 1 suggested, 1 skipped, 1 soft, 1 imported\./,
  );
  assert.doesNotMatch(brief, /Don't Panic|Answer is 42|Hitchhiker/i);
  assert.equal(brief.includes("!"), false);
});

test("a skipped required field with a non-empty assumed string is present", () => {
  const answers = REQUIRED.map((id) =>
    record(id, "SKIPPED", id === "DP-6.2" ? MOTION_ASSUMED : `ASSUMED ${id}`),
  );
  assert.deepEqual(missingRequired(answers), []);
  const brief = renderBrief(answers);
  assert.match(brief, /Coverage: 0 answered, 0 suggested, 6 skipped, 0 soft, 0 imported\./);
});
