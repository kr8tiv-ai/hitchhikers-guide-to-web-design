import assert from "node:assert/strict";
import { test } from "node:test";
import { renderCard, type CardState } from "../src/card.ts";

/**
 * Choices sit inside the question article. The transcript is a different region
 * and this HTML has no transcript lines.
 */

test("the card renders the radiogroup inside the article and not as a transcript line", () => {
  const html = renderCard(
    card({
      choices: {
        forId: "DP-0.1",
        origin: "model",
        items: [
          { id: "A", label: "A quiet order page for the shop.", why: "The industry is tea.", source: "industry:tea" },
          { id: "B", label: "Show the tin photo large on the page.", why: "The upload is a photo.", source: "upload:tins.jpg" },
          { id: "C", label: "Keep the menu note from the crawl.", why: "The crawl notes a menu.", source: "crawl:menu" },
          { id: "D", label: "Use the tea for the page.", why: "The industry is tea.", source: "industry:tea" },
        ],
      },
    }),
  );
  const articleEnd = html.lastIndexOf("</article>");
  const groupAt = html.indexOf('role="radiogroup"');
  assert.ok(groupAt > 0);
  assert.ok(articleEnd > groupAt);
  assert.match(html, /aria-labelledby="hh-card-ask"/);
  assert.match(html, /data-choices-origin="model"/);
  assert.match(html, /Options ready: 4 choices/);
  assert.match(html, /data-choice-id="A"/);
  assert.match(html, /data-choice-id="D"/);
  assert.match(html, /data-suggest-option="upload:tins.jpg"/);
  assert.match(html, /Other: I&#39;ll write my own/);
  assert.equal(html.includes('class="hh-turn"'), false);
  assert.equal(html.includes('role="alert"'), false);
  assert.equal(html.includes("hh-error"), false);
  const otherAt = html.indexOf('data-choice-id="other"');
  assert.ok(otherAt > html.indexOf('data-choice-id="D"'));
});

test("one model choice is singular and an echo of the ask is not a choice", () => {
  const one = renderCard(
    card({
      choices: {
        forId: "DP-0.1",
        origin: "model",
        items: [{ id: "A", label: "Show the tin on the page.", why: "A photo.", source: "upload:tins.jpg" }],
      },
    }),
  );
  assert.match(one, /Options ready: 1 choice/);
  assert.equal(one.includes("1 choices"), false);
  assert.match(one, /data-choice-id="other"/);

  const echo = renderCard(
    card({
      pushback: "What is the one concrete detail?",
      choices: {
        forId: "DP-0.1",
        origin: "model",
        items: [
          { id: "A", label: "Is this site for you, or for a client.", why: "Same question.", source: "question:suggest" },
          { id: "B", label: "What is the one concrete detail?", why: "The pushback.", source: "question:suggest" },
        ],
      },
    }),
  );
  assert.equal(echo.includes('role="radiogroup"'), false);
  assert.equal(echo.includes("Options ready"), false);
  assert.equal(echo.includes("data-choice-id"), false);
});

test("a pending card says the Guide is reading, and a draft enables Answer", () => {
  const pending = renderCard(card({ pending: true, draft: "A towel shop." }));
  assert.match(pending, /aria-busy="true"/);
  assert.match(pending, /Guide is reading your answer…/);
  assert.match(pending, /data-action="answer"[^>]*disabled/);

  const ready = renderCard(card({ draft: "A towel shop." }));
  assert.equal(ready.includes('aria-busy="true"'), false);
  assert.match(ready, /data-guide-reading[^>]*>\s*</);
  assert.doesNotMatch(ready, /data-action="answer"[^>]*disabled/);

  const blank = renderCard(card({ draft: "   " }));
  assert.match(blank, /data-action="answer"[^>]*disabled/);
});

test("a choice set for another question is not rendered", () => {
  const html = renderCard(
    card({
      choices: {
        forId: "DP-0.2",
        origin: "fallback",
        items: [{ id: "A", label: "A short line for the shop.", why: "The standing line.", source: "question:suggest" }],
      },
    }),
  );
  assert.equal(html.includes('role="radiogroup"'), false);
  assert.equal(html.includes("data-suggest-option"), false);
});

function card(overrides: Partial<CardState> = {}): CardState {
  return {
    question: {
      id: "DP-0.1",
      module: "towel-check",
      depth: ["deep"],
      ask: "Is this site for you, or for a client?",
      why: "The desk needs an answer.",
      input: ["text"],
      skipDefault: "For myself.",
      suggest: "Yourself, or one named client.",
      writes: ["PROJECT.md#audience"],
    },
    draft: "",
    pushback: null,
    error: null,
    done: false,
    pending: false,
    ...overrides,
  };
}
