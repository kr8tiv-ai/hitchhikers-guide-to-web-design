/**
 * BUG-049. A heading is a whole question. Periods inside quotes stay in the recap.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { settleQuestionText } from "../src/question-parts.ts";

const ASK = "Do you have the words for the site, or should the Guide write them for you to approve?";
const TAGLINE =
  'You already set the line to "Paradise Found. Find your calm." Do you have the words for the site, or should the Guide write them for you to approve?';

test("a quoted tagline with an inner period does not open the heading", () => {
  const parts = settleQuestionText(TAGLINE, ASK);
  assert.equal(parts.question, ASK);
  assert.match(parts.lead, /Paradise Found/);
  assert.match(parts.lead, /Find your calm/);
  assert.equal(parts.question.startsWith("Find"), false);
  assert.equal(/^["”’]/.test(parts.question), false);

  const curly = settleQuestionText(
    "You already set the line to \u201CParadise Found. Find your calm.\u201D Do you have the words for the site, or should the Guide write them for you to approve?",
    ASK,
  );
  assert.equal(curly.question, ASK);
  assert.match(curly.lead, /Paradise Found/);

  const nested = settleQuestionText("She said \"he said 'wait. now' today.\" What should the site do?", "What should the site do?");
  assert.equal(nested.question, "What should the site do?");
  assert.match(nested.lead, /wait\. now/);

  const paren = settleQuestionText(
    "The line (Paradise Found. Find your calm.) stays. What should the site do?",
    "What should the site do?",
  );
  assert.equal(paren.question, "What should the site do?");
  assert.match(paren.lead, /Find your calm/);
});

test("a fragment that starts with a closing quote falls back to the tree ask", () => {
  const broken = `Find your calm." ${ASK}`;
  const parts = settleQuestionText(broken, ASK);
  assert.equal(parts.question, ASK);
  assert.equal(parts.question.endsWith("?"), true);
});

test("logo, color, and blog confirmations stay one heading", () => {
  const logo = "You said you have a logo (paradise-found-logo.png). Drop the file here, or tell us if you want a variant.";
  const logoParts = settleQuestionText(logo, "Do you have a logo?");
  assert.equal(logoParts.question, logo);
  assert.equal(logoParts.lead, "");

  const colors = "You can keep the five from the hero (jungle green, sunset gold). Change?";
  const colorParts = settleQuestionText(colors, "Do you have colors?");
  assert.equal(colorParts.question, colors);
  assert.equal(colorParts.lead, "");

  const blog = "You already covered the blog (No blog.). Keep that, or change it?";
  const blogParts = settleQuestionText(blog, "Do you want a blog?");
  assert.equal(blogParts.question, blog);
  assert.equal(blogParts.lead, "");
});
