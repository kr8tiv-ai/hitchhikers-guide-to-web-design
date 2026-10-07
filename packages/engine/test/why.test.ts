import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { WhyError, compileWhy } from "../src/index.ts";
import type { AnswerRecord, WhyDraft } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const whySource = path.resolve(here, "..", "src", "brand", "why.ts");

const BANNED = ["innovative", "elevate", "seamless", "cutting-edge", "passionate"] as const;

const SITE = "The stall exists so regulars can find the tea.";
const VISITOR = "a night regular";
const OFFER = "a tin of tea";

function answer(id: string, status: AnswerRecord["status"], value: string): AnswerRecord {
  return { id, status, value };
}

function wordCount(value: string): number {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed === "") return 0;
  return trimmed.split(" ").length;
}

function wordPrefix(text: string, limit: number): string {
  const parts = text.split(" ");
  let kept = "";
  for (const part of parts) {
    const next = kept === "" ? part : `${kept} ${part}`;
    if (next.length > limit) return kept;
    kept = next;
  }
  return kept;
}

function base(extra: AnswerRecord[] = []): AnswerRecord[] {
  return [
    answer("DP-2.1", "ANSWERED", SITE),
    answer("DP-2.6", "ANSWERED", VISITOR),
    answer("DP-2.7", "ANSWERED", OFFER),
    ...extra,
  ];
}

function assertNoHype(draft: WhyDraft): void {
  for (const text of [draft.siteWhy, draft.brandWhy]) {
    assert.equal(text.includes("!"), false);
    for (const word of BANNED) {
      const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      assert.doesNotMatch(text, pattern);
    }
  }
}

test("missing DP-2.1 throws WhyError", () => {
  const cases: AnswerRecord[][] = [
    [],
    [answer("DP-2.1", "ANSWERED", "   ")],
    [answer("DP-2.1", "SKIPPED", "\n")],
    [answer("DP-2.6", "ANSWERED", VISITOR)],
    [answer("DP-2.1", "ANSWERED", "innovative!")],
  ];
  for (const answers of cases) {
    assert.throws(
      () => compileWhy(answers),
      (error: unknown) => {
        assert.ok(error instanceof WhyError);
        assert.match(error.message, /DP-2\.1/);
        assert.equal(error.message.includes("!"), false);
        return true;
      },
    );
  }
});

test("a deferred brand why is ASSUMED and contains no banned word", () => {
  const draft = compileWhy(base());
  assert.equal(draft.status, "ASSUMED");
  assert.equal(draft.siteWhy, SITE);
  assert.equal(draft.siteTruncated, false);
  assert.equal(draft.brandWhy, `${VISITOR} comes for ${OFFER} because ${SITE}`);
  assert.equal(draft.warnings.length, 0);
  assertNoHype(draft);
});

test("a banned word in the offer is removed and named in warnings", () => {
  for (const word of BANNED) {
    const draft = compileWhy([
      answer("DP-2.1", "ANSWERED", SITE),
      answer("DP-2.6", "ANSWERED", VISITOR),
      answer("DP-2.7", "ANSWERED", `a ${word} tin`),
    ]);
    assert.equal(draft.status, "ASSUMED");
    assert.equal(draft.brandWhy, `${VISITOR} comes for a tin because ${SITE}`);
    assert.ok(
      draft.warnings.some((warning) => warning.includes(`"${word}"`) && warning.includes("offer")),
    );
    assertNoHype(draft);
  }
});

test("innovation may remain and innovative may not", () => {
  const draft = compileWhy([
    answer("DP-2.1", "ANSWERED", SITE),
    answer("DP-2.6", "ANSWERED", VISITOR),
    answer("DP-2.7", "ANSWERED", "innovation in an Innovative tin, elevated and elevates"),
  ]);
  assert.match(draft.brandWhy, /\binnovation\b/);
  assert.match(draft.brandWhy, /\belevated\b/);
  assert.match(draft.brandWhy, /\belevates\b/);
  assert.doesNotMatch(draft.brandWhy, /\binnovative\b/i);
  assert.ok(draft.warnings.some((warning) => warning.includes('"innovative"')));
});

test("an exclamation mark is stripped and named, and the output has none", () => {
  const site = "The stall exists so regulars can find the tea";
  const draft = compileWhy([
    answer("DP-2.1", "ANSWERED", `${site}!`),
    answer("DP-2.6", "ANSWERED", "a night regular!"),
    answer("DP-2.7", "ANSWERED", "a tin!"),
  ]);
  assert.equal(draft.siteWhy, site);
  assert.equal(draft.brandWhy, `${VISITOR} comes for a tin because ${site}`);
  assert.equal(draft.siteWhy.includes("!"), false);
  assert.equal(draft.brandWhy.includes("!"), false);
  assert.ok(draft.warnings.some((warning) => warning.includes("exclamation") && warning.includes("site why")));
  assert.ok(draft.warnings.some((warning) => warning.includes("exclamation") && warning.includes("offer")));
  for (const warning of draft.warnings) assert.equal(warning.includes("!"), false);
  assertNoHype(draft);
});

test("a site why longer than 240 characters is truncated on a word", () => {
  const words = Array.from({ length: 70 }, (_, index) => `tok${index}`);
  const full = words.join(" ");
  assert.ok(full.length > 240);
  const draft = compileWhy([
    answer("DP-2.1", "ANSWERED", `  ${full}  `),
    answer("DP-2.6", "ANSWERED", VISITOR),
    answer("DP-2.7", "ANSWERED", OFFER),
  ]);
  const expected = wordPrefix(full, 240);
  assert.equal(draft.siteTruncated, true);
  assert.equal(draft.siteWhy, expected);
  assert.ok(draft.siteWhy.length <= 240);
  assert.ok(draft.siteWhy.length > 0);
  assert.equal(full.startsWith(`${draft.siteWhy} `), true);
  assert.equal(draft.brandWhy, `${VISITOR} comes for ${OFFER} because ${draft.siteWhy}`);
  assert.equal(draft.status, "ASSUMED");
});

test("a site why of 240 characters is not truncated, and a single long token is cut at 240", () => {
  const exact = "a".repeat(240);
  const kept = compileWhy([answer("DP-2.1", "ANSWERED", exact)]);
  assert.equal(kept.siteTruncated, false);
  assert.equal(kept.siteWhy, exact);

  const over = "b".repeat(241);
  const cut = compileWhy([answer("DP-2.1", "ANSWERED", over)]);
  assert.equal(cut.siteTruncated, true);
  assert.equal(cut.siteWhy, "b".repeat(240));
  assert.equal(cut.brandWhy, cut.siteWhy);
  assert.equal(cut.status, "ASSUMED");
});

test("an IMPORTED DP-1.7 of sufficient length is kept and not rewritten", () => {
  const imported = "To keep the night stall open so regulars can find a real tin.";
  assert.ok(wordCount(imported) >= 8);
  const template = `${VISITOR} comes for ${OFFER} because ${SITE}`;
  const draft = compileWhy([
    ...base(),
    answer("DP-1.7", "IMPORTED", `  ${imported}  `),
  ]);
  assert.equal(draft.status, "IMPORTED");
  assert.equal(draft.brandWhy, imported);
  assert.notEqual(draft.brandWhy, template);
  assert.equal(draft.siteWhy, SITE);
  assertNoHype(draft);
});

test("an ANSWERED DP-1.7 of at least 8 words is preserved", () => {
  const answered = "To hold the stall open for night regulars.";
  assert.equal(wordCount(answered), 8);
  const draft = compileWhy([...base(), answer("DP-1.7", "ANSWERED", answered)]);
  assert.equal(draft.status, "ANSWERED");
  assert.equal(draft.brandWhy, answered);
});

test("a short, suggested, or skipped DP-1.7 is not rewritten into an answered why", () => {
  const short = "Sell tea to the night square now.";
  assert.equal(wordCount(short), 7);
  const suggested = "To keep a suggested why from replacing the visitor offer sentence here.";
  assert.ok(wordCount(suggested) >= 8);
  for (const record of [
    answer("DP-1.7", "ANSWERED", short),
    answer("DP-1.7", "SUGGESTED", suggested),
    answer("DP-1.7", "SKIPPED", suggested),
    answer("DP-1.7", "SOFT", suggested),
  ]) {
    const draft = compileWhy([...base(), record]);
    assert.equal(draft.status, "ASSUMED");
    assert.equal(draft.brandWhy, `${VISITOR} comes for ${OFFER} because ${SITE}`);
  }
});

test("a real DP-1.7 is preserved when the offer is missing", () => {
  const answered = "To hold the stall open for night regulars.";
  const draft = compileWhy([
    answer("DP-2.1", "ANSWERED", SITE),
    answer("DP-2.6", "ANSWERED", VISITOR),
    answer("DP-1.7", "ANSWERED", answered),
  ]);
  assert.equal(draft.status, "ANSWERED");
  assert.equal(draft.brandWhy, answered);
});

test("a missing offer makes the assumed brand why the site why only", () => {
  const draft = compileWhy([
    answer("DP-2.1", "ANSWERED", SITE),
    answer("DP-2.6", "ANSWERED", VISITOR),
    answer("DP-2.7", "ANSWERED", "   "),
  ]);
  assert.equal(draft.status, "ASSUMED");
  assert.equal(draft.brandWhy, SITE);
});

test("an empty visitor with a present offer still produces a sentence", () => {
  const draft = compileWhy([
    answer("DP-2.1", "ANSWERED", SITE),
    answer("DP-2.6", "ANSWERED", "   "),
    answer("DP-2.7", "ANSWERED", OFFER),
  ]);
  assert.equal(draft.status, "ASSUMED");
  assert.equal(draft.brandWhy, `Comes for ${OFFER} because ${SITE}`);
  assert.equal(draft.brandWhy.includes("!"), false);
});

test("a SKIPPED site why with assumed text is allowed and the brand draft stays ASSUMED", () => {
  const assumed = "ASSUMED. The stall needs a page so people can find the tea.";
  const draft = compileWhy([
    answer("DP-2.1", "SKIPPED", assumed),
    answer("DP-2.6", "ANSWERED", VISITOR),
    answer("DP-2.7", "ANSWERED", OFFER),
  ]);
  assert.equal(draft.siteWhy, assumed);
  assert.equal(draft.status, "ASSUMED");
  assert.equal(draft.brandWhy, `${VISITOR} comes for ${OFFER} because ${assumed}`);
});

test("HTML in an answer is stored as text and is not interpreted", () => {
  const raw = "<p>\nTom &amp; the stall exist so regulars can find the tea.\n</p>";
  const draft = compileWhy([answer("DP-2.1", "ANSWERED", raw)]);
  assert.equal(draft.siteWhy, "<p> Tom &amp; the stall exist so regulars can find the tea. </p>");
  assert.match(draft.siteWhy, /<p>/);
  assert.match(draft.siteWhy, /<\/p>/);
  assert.match(draft.siteWhy, /&amp;/);
  assert.equal(draft.brandWhy, draft.siteWhy);
});

test("the last record for an id wins", () => {
  const draft = compileWhy([
    answer("DP-2.1", "ANSWERED", "The first sentence is not the one we keep today."),
    answer("DP-2.1", "ANSWERED", SITE),
    answer("DP-2.7", "ANSWERED", "a mug"),
    answer("DP-2.7", "ANSWERED", OFFER),
    answer("DP-1.7", "ANSWERED", "To hold the stall open for night regulars."),
    answer("DP-1.7", "IMPORTED", "To keep the night stall open so regulars can find a real tin."),
  ]);
  assert.equal(draft.siteWhy, SITE);
  assert.equal(draft.status, "IMPORTED");
  assert.equal(draft.brandWhy, "To keep the night stall open so regulars can find a real tin.");
});

test("a qualifying brand why still drops a banned word and a bang without becoming the template", () => {
  const value = "We keep the stall open so regulars can taste innovative tea!";
  assert.ok(wordCount(value) >= 8);
  const draft = compileWhy([
    ...base(),
    answer("DP-1.7", "ANSWERED", value),
  ]);
  assert.equal(draft.status, "ANSWERED");
  assert.equal(draft.brandWhy, "We keep the stall open so regulars can taste tea");
  assert.notEqual(draft.brandWhy, `${VISITOR} comes for ${OFFER} because ${SITE}`);
  assert.ok(draft.warnings.some((warning) => warning.includes('"innovative"') && warning.includes("brand why")));
  assert.ok(draft.warnings.some((warning) => warning.includes("exclamation") && warning.includes("brand why")));
  assertNoHype(draft);
});

test("compileWhy does not call the network or paste the finder prompt", () => {
  const source = readFileSync(whySource, "utf8");
  const barrel = readFileSync(path.resolve(here, "..", "src", "brand", "index.ts"), "utf8");
  assert.match(barrel, /compileWhy/);
  assert.equal(/fetch\s*\(/.test(source), false);
  assert.equal(source.includes("node:http"), false);
  assert.equal(source.includes("node:https"), false);
  assert.equal(/grok/i.test(source), false);
  assert.equal(/imagine/i.test(source), false);
  assert.equal(source.includes("Start With Why"), false);
  assert.equal(source.includes("Ask me one question at a time"), false);
  assert.equal(source.includes("brand strategist"), false);
  const draft = compileWhy(base());
  assert.equal("then" in draft, false);
});
