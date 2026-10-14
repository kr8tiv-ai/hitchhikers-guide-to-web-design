/**
 * BUG-032. The heading is the question. A recap sits in the paragraph below it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderCard, type CardState } from "../src/card.ts";
import { settleQuestionText, splitQuestionText } from "../src/question-parts.ts";
import type { Question } from "@hitchhiker/engine";

const MAINTAINER =
  "Once paradisefound.farm is live, someone still changes a price, a photo, a sold-out week, a harvest note, or the winter hours on the stall page, and that edit has to land without calling a studio back. Who will look after the site once it is live?";

const MOTION =
  "The pages stay calm, and reduced motion keeps the heavy scenes still so a visitor is not swept along by film, trailers, or a long scroll that moves on its own. Is anyone in the audience sensitive to motion?";

const FILTERS =
  "Acre and price filters, a sold-out mark, and the winter stall hours are all fighting for the same row on the farm pages, and the row cannot hold every one of them. Which should the farm pages drop?";

const FROM_LEAD =
  "So the question is who will look after the site once it is live? Once paradisefound.farm is live, someone still changes a price, a photo, or the winter hours, and that edit has to land the same day.";

const ASK = /^(?:name|tell|describe|pick|choose|list|say|write|add|drop|keep|show|give|send|paste|let's|change|walk|set|mark|share|note|point)\b/i;

function isAsk(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.endsWith("?") || ASK.test(trimmed);
}

function question(id: string, ask: string): Question {
  return {
    id,
    module: "limits",
    depth: ["deep"],
    ask,
    why: "Someone publishes and answers the form.",
    input: ["text"],
    skipDefault: "The owner maintains it.",
    suggest: "You, or a named teammate.",
    followUps: [],
    writes: ["SITE-BRIEF.md#maintainer"],
  };
}

function card(parts: { question: string; lead: string; help: string }, id: string): string {
  const state: CardState = {
    question: question(id, parts.question),
    draft: "",
    pushback: null,
    error: null,
    done: false,
    pending: false,
    lead: parts.lead,
    help: parts.help,
  };
  return renderCard(state);
}

function heading(html: string): string {
  const match = /<h2 class="hh-qcard__title"[^>]*>([^<]*)<\/h2>/.exec(html);
  assert.ok(match?.[1]);
  return match[1];
}

test("the three Paradise Found recaps yield the question as the heading", () => {
  const cases = [
    { text: MAINTAINER, ask: "Who will look after the site once it is live?", recap: "changes a price" },
    { text: MOTION, ask: "Is anyone in the audience sensitive to motion?", recap: "reduced motion" },
    { text: FILTERS, ask: "Which should the farm pages drop?", recap: "Acre and price filters" },
  ];
  for (const item of cases) {
    const parts = splitQuestionText(item.text);
    assert.equal(parts.question, item.ask, item.text);
    assert.match(parts.help, new RegExp(item.recap));
    assert.equal(parts.question.includes(item.recap), false);
    const html = card(parts, "DP-9.3");
    const h2 = heading(html);
    assert.equal(h2, item.ask);
    assert.match(html, /data-card-help/);
    const helpAt = html.indexOf("data-card-help");
    const h2At = html.indexOf('id="hh-card-ask"');
    assert.ok(helpAt > h2At, item.ask);
  }
});

test("settle keeps a long Paradise Found recap under the heading", () => {
  const cases = [
    { text: MAINTAINER, ask: "Who will look after the site once it is live?", recap: "changes a price" },
    { text: MOTION, ask: "Is anyone in the audience sensitive to motion?", recap: "reduced motion" },
    { text: FILTERS, ask: "Which should the farm pages drop?", recap: "Acre and price filters" },
  ];
  for (const item of cases) {
    const parts = settleQuestionText(item.text, item.ask);
    assert.equal(parts.question, item.ask, item.ask);
    assert.equal(parts.lead.includes(item.recap), false, item.ask);
    assert.match(parts.help, new RegExp(item.recap));
    const html = card(parts, "DP-9.3");
    assert.match(html, /data-card-help/);
    const helpAt = html.indexOf("data-card-help");
    const h2At = html.indexOf('id="hh-card-ask"');
    assert.ok(helpAt > h2At, item.ask);
  }
});

test("a heading with no question takes the last question sentence from the lead", () => {
  const parts = splitQuestionText(FROM_LEAD);
  assert.equal(parts.question, "So the question is who will look after the site once it is live?");
  assert.match(parts.help, /changes a price/);
  assert.equal(parts.lead.includes("?"), false);
});

test("a stubbed run keeps every heading as a question or an ask", () => {
  const stubs = [
    MAINTAINER,
    MOTION,
    FILTERS,
    FROM_LEAD,
    "Don't Panic. You said this is the first site. What do you love about that site, and what makes you wince?",
    "Name the person who publishes a price change.",
    "Send screenshots of fonts you like, or I can show you pairings",
  ];
  for (const text of stubs) {
    const parts = splitQuestionText(text);
    const html = card(parts, "DP-9.3");
    const h2 = heading(html);
    assert.equal(isAsk(h2), true, h2);
  }
});
