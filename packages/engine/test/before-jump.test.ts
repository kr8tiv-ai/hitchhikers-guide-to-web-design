import assert from "node:assert/strict";
import { test } from "node:test";
import { BRAND_SECTIONS } from "../src/brand/approve.ts";
import type { AnswerRecord } from "../src/required.ts";
import { beforeWeJump } from "../src/spec/before-jump.ts";

const LAUNCH_QUESTION = "What should the launch announcement avoid claiming?";
const FILLERS = [
  LAUNCH_QUESTION,
  "Which page should the launch announcement link to first?",
  "Who should read the launch announcement before it is sent?",
] as const;

const SETTLED_HOST =
  "Hostinger. Domain owned at Namecheap. DNS records are at Cloudflare. Email is on the domain.";

function record(id: string, status: AnswerRecord["status"], value: string): AnswerRecord {
  return { id, status, value };
}

function approved(): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const section of BRAND_SECTIONS) flags[section] = true;
  return flags;
}

function closedAnswers(overrides: AnswerRecord[] = []): AnswerRecord[] {
  const base: AnswerRecord[] = [
    record("DP-2.1", "ANSWERED", "A night stall for regulars."),
    record("DP-2.6", "ANSWERED", "Night stall regulars."),
    record("DP-2.2", "ANSWERED", "Reserve a seat."),
    record("DP-5.3", "ANSWERED", "paper, ink, night"),
    record("DP-6.2", "ANSWERED", "4"),
    record("DP-9.2", "ANSWERED", SETTLED_HOST),
    record("DP-3.8", "ANSWERED", "Plausible. No cookie banner."),
    record("DP-9.1", "ANSWERED", "2026-11-01"),
    record("DP-8.4", "ANSWERED", "Privacy and terms."),
  ];
  const map = new Map<string, AnswerRecord>();
  for (const item of base) map.set(item.id, item);
  for (const item of overrides) map.set(item.id, item);
  return [...map.values()];
}

function assertBounds(questions: string[]): void {
  assert.ok(questions.length >= 3, `length ${questions.length} is under 3`);
  assert.ok(questions.length <= 8, `length ${questions.length} is over 8`);
  for (const question of questions) {
    assert.equal(question.includes("!"), false, question);
    assert.equal(question.includes("！"), false, question);
    assert.equal(question.endsWith("?"), true, question);
    assert.equal(/\btestimonials?\b/i.test(question), false, question);
  }
}

test("a closed project returns the launch question and two fillers", () => {
  const { questions } = beforeWeJump({
    answers: closedAnswers(),
    approvals: approved(),
    hasLegalPage: true,
  });
  assert.deepEqual(questions, [...FILLERS]);
  assert.equal(questions.length, 3);
  assertBounds(questions);
});

test("hosting no idea asks where the site should be hosted", () => {
  for (const value of ["no idea", "No Idea", "ASSUMED: no idea"]) {
    const { questions } = beforeWeJump({
      answers: closedAnswers([record("DP-9.2", "ANSWERED", value)]),
      approvals: approved(),
      hasLegalPage: true,
    });
    assert.ok(
      questions.some((question) => question.includes("host")),
      value,
    );
    assert.match(questions[0] ?? "", /no idea/i);
    assertBounds(questions);
  }
});

test("an express no idea host names the stored default", () => {
  const { questions } = beforeWeJump({
    answers: closedAnswers([record("DP-9.2", "SKIPPED", "ASSUMED: no idea")]),
    approvals: approved(),
    hasLegalPage: true,
  });
  assert.match(questions[0] ?? "", /Express stored that default/);
  assert.ok((questions[0] ?? "").includes("host"));
  assertBounds(questions);
});

test("an answered host is not asked again", () => {
  const { questions } = beforeWeJump({
    answers: closedAnswers(),
    approvals: approved(),
    hasLegalPage: true,
  });
  const blob = questions.join("\n");
  assert.equal(/where should the site be hosted/i.test(blob), false);
  assert.equal(blob.includes("Night stall regulars"), false);
  assert.equal(blob.includes("Plausible"), false);
  assert.equal(blob.includes("Namecheap"), false);
  assertBounds(questions);
});

test("suggested and imported hosts are not asked again", () => {
  for (const status of ["SUGGESTED", "IMPORTED"] as const) {
    const { questions } = beforeWeJump({
      answers: closedAnswers([record("DP-9.2", status, SETTLED_HOST)]),
      approvals: approved(),
      hasLegalPage: true,
    });
    assert.equal(questions.some((question) => question.includes("host")), false, status);
    assert.deepEqual(questions, [...FILLERS]);
  }
});

test("a later answer replaces a soft one and is not re-asked", () => {
  const { questions } = beforeWeJump({
    answers: [
      ...closedAnswers(),
      record("DP-9.3", "SOFT", "Maybe the owner."),
      record("DP-9.3", "ANSWERED", "Ada maintains it."),
    ],
    approvals: approved(),
    hasLegalPage: true,
  });
  const blob = questions.join("\n");
  assert.equal(blob.includes("Maybe the owner"), false);
  assert.equal(blob.includes("Ada maintains it"), false);
  assert.equal(blob.includes("DP-9.3"), false);
  assert.deepEqual(questions, [...FILLERS]);
});

test("empty approvals asks every brand section by name", () => {
  const { questions } = beforeWeJump({
    answers: closedAnswers(),
    approvals: {},
    hasLegalPage: true,
  });
  assert.equal(questions.length, BRAND_SECTIONS.length);
  for (const section of BRAND_SECTIONS) {
    assert.ok(
      questions.some((question) => question.startsWith(`Brand section ${section} is unapproved`)),
      section,
    );
  }
  assert.equal(questions.includes(LAUNCH_QUESTION), false);
  assertBounds(questions);
});

test("an approved section is not asked and the others are", () => {
  const approvals: Record<string, boolean> = {};
  for (const section of BRAND_SECTIONS) approvals[section] = section === "purpose";
  const { questions } = beforeWeJump({
    answers: closedAnswers(),
    approvals,
    hasLegalPage: true,
  });
  assert.equal(
    questions.some((question) => question.startsWith("Brand section purpose is unapproved")),
    false,
  );
  for (const section of BRAND_SECTIONS) {
    if (section === "purpose") continue;
    assert.ok(questions.some((question) => question.includes(section)), section);
  }
  assertBounds(questions);
});

test("a missing legal page is asked, then fillers stop at 3", () => {
  const { questions } = beforeWeJump({
    answers: closedAnswers(),
    approvals: approved(),
    hasLegalPage: false,
  });
  assert.equal(questions.length, 3);
  assert.match(questions[0] ?? "", /legal page/i);
  assert.equal(questions[1], FILLERS[0]);
  assert.equal(questions[2], FILLERS[1]);
  assertBounds(questions);
});

test("a legal page on file is not asked", () => {
  const { questions } = beforeWeJump({
    answers: closedAnswers(),
    approvals: approved(),
    hasLegalPage: true,
  });
  assert.equal(questions.some((question) => /legal page/i.test(question)), false);
});

test("two real gaps gain one filler and do not grow to 8", () => {
  const approvals = approved();
  approvals.logo = false;
  const { questions } = beforeWeJump({
    answers: closedAnswers(),
    approvals,
    hasLegalPage: false,
  });
  assert.equal(questions.length, 3);
  assert.match(questions[0] ?? "", /Brand section logo is unapproved/);
  assert.match(questions[1] ?? "", /legal page/i);
  assert.equal(questions[2], LAUNCH_QUESTION);
  assertBounds(questions);
});

test("calm voice and motion 9 asks for a calm 9 or a drop to 7", () => {
  const { questions } = beforeWeJump({
    answers: closedAnswers([
      record("DP-5.3", "ANSWERED", "calm, paper, quiet"),
      record("DP-6.2", "ANSWERED", "9"),
    ]),
    approvals: approved(),
    hasLegalPage: true,
  });
  assert.match(
    questions[0] ?? "",
    /The voice says calm, but motion is 9\. Want a calm 9 \(slow camera, no flashes\), or should it drop to 7\?/,
  );
  assert.equal(questions.length, 3);
  assertBounds(questions);
});

test("calm voice and motion 10 uses that level", () => {
  const { questions } = beforeWeJump({
    answers: closedAnswers([
      record("DP-5.4e", "ANSWERED", "calm and expensive"),
      record("DP-6.2", "ANSWERED", "10"),
    ]),
    approvals: approved(),
    hasLegalPage: true,
  });
  assert.match(questions[0] ?? "", /motion is 10/);
  assert.match(questions[0] ?? "", /drop to 7/);
  assertBounds(questions);
});

test("calm voice and motion 4 does not ask to drop motion", () => {
  const { questions } = beforeWeJump({
    answers: closedAnswers([record("DP-5.3", "ANSWERED", "calm, paper, quiet")]),
    approvals: approved(),
    hasLegalPage: true,
  });
  assert.equal(questions.some((question) => /drop to 7/.test(question)), false);
  assert.deepEqual(questions, [...FILLERS]);
});

test("so long gaps ask about domain, dns, email, analytics, and launch date", () => {
  const answers = closedAnswers([record("DP-9.2", "ANSWERED", "Hostinger")]).filter(
    (item) => item.id !== "DP-3.8" && item.id !== "DP-9.1",
  );
  const { questions } = beforeWeJump({
    answers,
    approvals: approved(),
    hasLegalPage: true,
  });
  assert.deepEqual(questions, [
    "The domain is still open. Which name should the site use, and who is the registrar?",
    "DNS is still open. Who can change the records before launch?",
    "Email on the domain is still open. Which address should the site use?",
    "Analytics is still open. Which should launch use: Plausible, Umami, or GA4 with consent?",
    "The launch date is still open. What date should the site go live?",
  ]);
  assert.equal(questions.includes(LAUNCH_QUESTION), false);
  assertBounds(questions);
});

test("express defaults and soft answers are re-asked", () => {
  const { questions } = beforeWeJump({
    answers: [
      ...closedAnswers(),
      record("DP-4.1", "SKIPPED", "ASSUMED: No competitors named."),
      record("DP-9.3", "SOFT", "Maybe the owner."),
    ],
    approvals: approved(),
    hasLegalPage: true,
  });
  assert.equal(questions.length, 3);
  assert.match(questions[0] ?? "", /DP-4\.1/);
  assert.match(questions[0] ?? "", /Express default/);
  assert.match(questions[0] ?? "", /No competitors named/);
  assert.match(questions[1] ?? "", /DP-9\.3/);
  assert.match(questions[1] ?? "", /soft/);
  assert.equal(questions[2], LAUNCH_QUESTION);
  assertBounds(questions);
});

test("a proof gap does not ask for a testimonial", () => {
  const { questions } = beforeWeJump({
    answers: [...closedAnswers(), record("DP-8.2", "SOFT", "Add a testimonial from Ada.")],
    approvals: approved(),
    hasLegalPage: true,
  });
  assert.deepEqual(questions, [...FILLERS]);
  assert.equal(questions.join("\n").toLowerCase().includes("testimonial"), false);
  assertBounds(questions);
});

test("user punctuation and banned words stay out of the question", () => {
  const { questions } = beforeWeJump({
    answers: [
      ...closedAnswers(),
      record("DP-1.1", "SOFT", "Ship it now!"),
      record("DP-1.2", "SOFT", "We should elevate the journey!"),
    ],
    approvals: approved(),
    hasLegalPage: true,
  });
  const blob = questions.join("\n");
  assert.match(blob, /Ship it now/);
  assert.equal(blob.includes("elevate"), false);
  assert.equal(blob.includes("journey"), false);
  assert.equal(blob.includes("!"), false);
  assertBounds(questions);
});

test("more than 8 open items truncates and the last question says more are unapproved", () => {
  const { questions } = beforeWeJump({
    answers: [
      ...closedAnswers([record("DP-9.2", "ANSWERED", "no idea")]),
      record("DP-1.1", "SOFT", "Ship it!"),
      record("DP-4.1", "SKIPPED", "ASSUMED: No competitors named."),
      record("DP-9.3", "SOFT", "zebra constraint"),
    ],
    approvals: {},
    hasLegalPage: false,
  });
  assert.equal(questions.length, 8);
  assert.match(questions[0] ?? "", /host/);
  for (const section of BRAND_SECTIONS) {
    assert.ok(
      questions.some((question) => question.startsWith(`Brand section ${section} is unapproved`)),
      section,
    );
  }
  const last = questions[7] ?? "";
  assert.match(last, /More items are unapproved/);
  assert.match(last, /7 more items are still open/);
  const blob = questions.join("\n");
  assert.equal(blob.includes("zebra"), false);
  assert.equal(/legal page/i.test(blob), false);
  assertBounds(questions);
});

test("the same input returns the same list", () => {
  const input = {
    answers: closedAnswers([record("DP-9.2", "ANSWERED", "no idea")]),
    approvals: approved(),
    hasLegalPage: true,
  };
  assert.deepEqual(beforeWeJump(input).questions, beforeWeJump(input).questions);
});
