import assert from "node:assert/strict";
import { test } from "node:test";
import type { Facts } from "../src/guide/schemas.ts";
import {
  detectLanguage,
  guideTextIssues,
  questionCount,
  validateGuideMessage,
} from "../src/guide/validators.ts";

const facts: Facts = {
  answers: [{ id: "DP-2.1", value: "Order tea. The shelf holds 30 tins." }],
  uploads: ["tins.jpg"],
  crawlNotes: ["menu"],
  industry: "tea",
};

const clean = "What should the shop keep from the tin photo?";

test("a clean English question passes", () => {
  assert.deepEqual(validateGuideMessage(clean, { language: "en", facts }), []);
});

test("an exclamation mark is rejected", () => {
  assert.ok(validateGuideMessage("What should the shop keep!", { language: "en", facts }).includes("exclamation"));
});

test("an em dash is rejected", () => {
  const issues = guideTextIssues("The shop \u2014 a quiet counter.", { language: "en", facts });
  assert.ok(issues.includes("em-dash"));
});

test("a banned word is rejected", () => {
  const issues = validateGuideMessage("What would elevate the shop?", { language: "en", facts });
  assert.ok(issues.some((issue) => issue.startsWith("banned:elevate")));
});

test("two question marks are rejected", () => {
  const issues = validateGuideMessage("Is this yours? Or is it theirs?", { language: "en", facts });
  assert.ok(issues.includes("questions"));
  assert.equal(questionCount("Is this yours? Or is it theirs?"), 2);
});

test("zero question marks are rejected on a guide message", () => {
  assert.ok(validateGuideMessage("The shop is quiet.", { language: "en", facts }).includes("questions"));
});

test("an invented testimonial is rejected", () => {
  const issues = guideTextIssues("A customer said the tea is perfect.", { language: "en", facts });
  assert.ok(issues.includes("claim:testimonial"));
});

test("an invented award is rejected", () => {
  const issues = guideTextIssues("The shop won an award.", { language: "en", facts });
  assert.ok(issues.includes("claim:award"));
});

test("an invented number is rejected", () => {
  const issues = guideTextIssues("The shop serves 12 guests.", { language: "en", facts });
  assert.ok(issues.some((issue) => issue.startsWith("claim:number:12")));
});

test("a number that appears in the facts is allowed", () => {
  assert.deepEqual(guideTextIssues("The shelf holds 30 tins.", { language: "en", facts }), []);
});

test("English is rejected when the session language is Spanish", () => {
  const issues = validateGuideMessage("What is the shop name?", { language: "es", facts });
  assert.ok(issues.includes("language"));
});

test("Spanish is accepted when the session language is Spanish", () => {
  const issues = validateGuideMessage("Que tipo de sitio quieres para la tienda?", { language: "es", facts });
  assert.deepEqual(issues, []);
});

test("language detection needs two markers and ignores a lone la", () => {
  assert.equal(detectLanguage("The shop is mine."), "en");
  assert.equal(detectLanguage("la"), null);
  assert.equal(detectLanguage("Quiero una tienda para el sitio."), "es");
});
