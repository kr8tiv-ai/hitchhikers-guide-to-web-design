/**
 * BUG-035 recurrence. Markdown heading marks must not glue the lead into the h2.
 * The lead is its own paragraph. The heading is only the question.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Question } from "@hitchhiker/engine";
import { renderCard, type CardState } from "../src/card.ts";
import { settleQuestionText } from "../src/question-parts.ts";

const OFFER = "What do you sell or give away, and why should anyone care?";
const PAGES = "Which pages do you think you need? We can change this later.";
const PROOF = "What real proof can the site show: testimonials, reviews, numbers, client names, or press?";
const ANALYTICS = "We'll count visitors privately. Change?";

/** Step 726 in the bug note, QA-LOG step 727, DP-2.7. */
const STEP_726 =
  "You are walking Dana from a Colorado iPad to one ocean-view farm, then to a lawyer who checks the title before anyone talks about closing. ## What do you sell or give away, and why should anyone care?";
const WALKING =
  "You are walking Dana from a Colorado iPad to one ocean-view farm, then to a lawyer who checks the title before anyone talks about closing.";

/** Step 727 in the bug note, QA-LOG step 728, DP-2.8. The log keeps the sentence the bug note abbreviated. */
const STEP_727 =
  "The caretaker match is free. # Which pages do you think you need? We can change this later. A page is one place a visitor opens.";
const CARETAKER = "The caretaker match is free.";

/** Step 758 in the bug note, QA-LOG step 759, DP-8.2. */
const STEP_758 =
  "That is the spine. ## What real proof can the site show: testimonials, reviews, numbers, client names, or press?";
const SPINE = "That is the spine.";

const PHOTO =
  "Where should the photography come from: your own, stock, AI-made, or a mix?";

function question(id: string, ask: string): Question {
  return {
    id,
    module: "the-question",
    depth: ["deep"],
    ask,
    why: "The offer is the thing that changes hands.",
    input: ["text"],
    skipDefault: "Skip.",
    writes: ["SITE-BRIEF.md#field"],
  };
}

function card(ask: string, lead: string, help: string, id: string): string {
  const state: CardState = {
    question: question(id, ask),
    draft: "",
    pushback: null,
    error: null,
    done: false,
    pending: false,
    lead,
    help,
  };
  return renderCard(state);
}

function decode(text: string): string {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'");
}

function heading(html: string): string {
  const match = /<h2 class="hh-qcard__title"[^>]*>([^<]*)<\/h2>/.exec(html);
  assert.ok(match?.[1], html);
  return decode(match[1]);
}

function paragraph(html: string, marker: string): string {
  const match = new RegExp(`${marker}>([^<]*)<`).exec(html);
  return match?.[1] === undefined ? "" : decode(match[1]);
}

function assertNoMarkdown(parts: { lead: string; question: string; help: string }, label: string): void {
  for (const field of [parts.lead, parts.question, parts.help]) {
    assert.equal(field.includes("#"), false, `${label}: ${field}`);
    assert.equal(field.includes("**"), false, `${label}: ${field}`);
    assert.equal(/^[-*]\s/m.test(field), false, `${label}: ${field}`);
  }
}

test("steps 726, 727, and 758 split the lead from the question and drop heading marks", () => {
  const offer = settleQuestionText(STEP_726, OFFER);
  assert.equal(offer.question, OFFER);
  assert.equal(offer.lead, WALKING);
  assert.equal(offer.question.includes(WALKING), false);
  assert.equal(offer.lead.includes(OFFER), false);
  assertNoMarkdown(offer, "726");

  const pages = settleQuestionText(STEP_727, PAGES);
  assert.equal(pages.lead, CARETAKER);
  assert.match(pages.question, /^Which pages do you think you need\?/);
  assert.equal(pages.question.includes("caretaker"), false);
  assert.equal(pages.lead.includes("Which pages"), false);
  assertNoMarkdown(pages, "727");

  const proof = settleQuestionText(STEP_758, PROOF);
  assert.equal(proof.question, PROOF);
  assert.equal(proof.lead, SPINE);
  assert.equal(proof.question.includes(SPINE), false);
  assertNoMarkdown(proof, "758");
});

test("a lead that ends with a period stays out of the heading", () => {
  const joined = `${CARETAKER} ${PAGES}`;
  const parts = settleQuestionText(joined, PAGES);
  assert.equal(parts.lead, CARETAKER);
  assert.equal(parts.question, PAGES);
  assert.equal(parts.question.includes(CARETAKER), false);
  assertNoMarkdown(parts, "period");
});

test("heading marks at line start and inline, plus bold and list marks, stay out of the card text", () => {
  const inline = settleQuestionText(`**${SPINE}** ${STEP_758.slice(SPINE.length).trim()}`, PROOF);
  assert.equal(inline.lead, SPINE);
  assert.equal(inline.question, PROOF);
  assertNoMarkdown(inline, "inline bold");

  const lined = settleQuestionText(`${WALKING}\n## ${OFFER}`, OFFER);
  assert.equal(lined.lead, WALKING);
  assert.equal(lined.question, OFFER);
  assertNoMarkdown(lined, "line start");

  const hashes = ["#", "##", "###", "####", "#####", "######"];
  for (const mark of hashes) {
    const parts = settleQuestionText(`${mark} ${OFFER}`, OFFER);
    assert.equal(parts.question, OFFER, mark);
    assert.equal(parts.lead, "");
    assertNoMarkdown(parts, mark);
  }

  const listed = settleQuestionText(`- ${CARETAKER}\n# ${PAGES}`, PAGES);
  assert.equal(listed.lead.includes(CARETAKER), true);
  assert.match(listed.question, /^Which pages do you think you need\?/);
  assertNoMarkdown(listed, "list");

  const phase = settleQuestionText(
    `This stretch is called Don't Panic. ## ${PHOTO} Your own means photos you took of the farms.`,
    PHOTO,
  );
  assert.equal(phase.lead, "This stretch is called Don't Panic.");
  assert.match(phase.question, /^Where should the photography come from/);
  assert.equal(phase.question.includes("#"), false);
  assert.equal(phase.lead.includes("#"), false);
});

test("a colon join and a one-word Change fragment still fall back the way 226 settled them", () => {
  const colon = settleQuestionText(
    "Dana, on an iPad, still needs one clear thing to ask about. : What do you sell or give away, and why should anyone care?",
    OFFER,
  );
  assert.equal(colon.question, OFFER);
  assert.equal(colon.lead, "Dana, on an iPad, still needs one clear thing to ask about.");
  assert.equal(colon.question.includes(" : "), false);

  const fragment = settleQuestionText("Change?", ANALYTICS);
  assert.equal(fragment.question, ANALYTICS);
  assert.equal(fragment.question === "Change?", false);

  const marked = settleQuestionText("## Change?", ANALYTICS);
  assert.equal(marked.question, ANALYTICS);
  assert.equal(marked.question === "Change?", false);
  assertNoMarkdown(marked, "marked change");
});

test("the rendered h2 is only the question and the accessible name is not the lead", () => {
  const cases = [
    { id: "DP-2.7", text: STEP_726, base: OFFER, lead: WALKING },
    { id: "DP-2.8", text: STEP_727, base: PAGES, lead: CARETAKER },
    { id: "DP-8.2", text: STEP_758, base: PROOF, lead: SPINE },
  ];
  for (const item of cases) {
    const parts = settleQuestionText(item.text, item.base);
    const html = card(parts.question, parts.lead, parts.help, item.id);
    const h2 = heading(html);
    const lead = paragraph(html, "data-card-lead");
    assert.equal(h2.includes("#"), false, item.id);
    assert.equal(lead.includes("#"), false, item.id);
    assert.equal(h2.includes(item.lead), false, `${item.id}: ${h2}`);
    assert.equal(lead, item.lead, item.id);
    assert.equal(h2 === lead, false, item.id);
    assert.match(html, /aria-labelledby="hh-card-ask"/);
    assert.equal(html.split('id="hh-card-ask"').length - 1, 1, item.id);
    const leadAt = html.indexOf("data-card-lead");
    const h2At = html.indexOf('id="hh-card-ask"');
    assert.ok(leadAt >= 0 && leadAt < h2At, item.id);
    assert.equal(html.slice(h2At, html.indexOf("</h2>", h2At)).includes(item.lead), false, item.id);
  }
});
