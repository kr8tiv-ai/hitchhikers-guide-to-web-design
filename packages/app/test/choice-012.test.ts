/**
 * BUG-012. A choice belongs to one question. Its text and value carry no question id.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildChoicesForQuestion, renderCard, type CardState } from "../src/card.ts";

const DP = /DP-\d+(?:\.\d+)?/;

test("buildChoicesForQuestion strips question ids and drops another question's set", () => {
  const stale = buildChoicesForQuestion("DP-9.5", "Who maintains the site?", null, {
    forId: "DP-4.4",
    origin: "model",
    items: [
      { id: "A", label: "Keep the olive from DP-4.4.", why: "Seen at DP-4.4.", source: "answer:DP-4.4" },
    ],
  });
  assert.equal(stale, null);

  const built = buildChoicesForQuestion("DP-9.5", "Who maintains the site?", null, {
    forId: "DP-9.5",
    origin: "model",
    items: [
      { id: "A", label: "You, from DP-9.3.", why: "Named at DP-9.3.", source: "answer:DP-4.4" },
      { id: "B", label: "A friend who can edit.", why: "A person, not a question id.", source: "answer:DP-9.3" },
    ],
  });
  assert.ok(built);
  assert.equal(built?.forId, "DP-9.5");
  assert.equal(built?.items[0]?.label, "You, from .");
  assert.equal(built?.items[0]?.source, "answer");
  assert.equal(DP.test(built?.items[0]?.label ?? ""), false);
  assert.equal(DP.test(built?.items[0]?.source ?? ""), false);
  assert.equal(DP.test(built?.items[1]?.source ?? ""), false);

  const html = renderCard(
    card({
      choices: {
        forId: "DP-0.1",
        origin: "model",
        items: [
          { id: "A", label: "Keep the olive from DP-4.4.", why: "Old card.", source: "answer:DP-4.4" },
          { id: "B", label: "A friend who can edit.", why: "A person.", source: "industry:tea" },
        ],
      },
    }),
  );
  const group = html.slice(html.indexOf('role="radiogroup"'), html.indexOf("hh-qcard__field"));
  assert.equal(/data-choice-label="[^"]*DP-/.test(group), false, group);
  assert.equal(/data-suggest-option="[^"]*DP-/.test(group), false, group);
  assert.equal(/hh-choice__label">[^<]*DP-/.test(group), false, group);
  assert.match(group, /data-suggest-option="answer"/);
  assert.match(group, /data-suggest-option="industry:tea"/);
  assert.match(group, /data-choices-for="DP-0.1"/);

  const next = renderCard(
    card({
      question: {
        id: "DP-9.5",
        module: "towel-check",
        depth: ["deep"],
        ask: "Who will look after the site once it is live?",
        why: "Someone still changes a price.",
        input: ["text"],
        skipDefault: "The owner.",
        suggest: "You, a friend, or a helper.",
        writes: ["PROJECT.md#maintainer"],
      },
      choices: {
        forId: "DP-4.4",
        origin: "model",
        items: [{ id: "A", label: "A stale option from the colour card.", why: "Wrong card.", source: "answer:DP-4.4" }],
      },
    }),
  );
  assert.equal(next.includes('role="radiogroup"'), false);
  assert.equal(next.includes("A stale option"), false);
  assert.equal(next.includes("answer:DP-4.4"), false);
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
