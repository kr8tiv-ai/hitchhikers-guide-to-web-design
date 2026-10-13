/**
 * BUG-002. The heading is only the question. Lead and recap sit above it.
 * Button instructions stay off the card because the buttons already say them.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadTree } from "@hitchhiker/engine";
import { renderCard, type CardState } from "../src/card.ts";
import { splitQuestionText } from "../src/question-parts.ts";
import type { Question } from "@hitchhiker/engine";

const treeFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "interview", "tree.yaml");

const STEP_003 =
  "Don't Panic. This phase is just you looking at a site the way a designer looks at a margin: what holds, and what pinches. You said this is the first site, for your own business. So the question is about that one. What do you love about that site, and what makes you wince? Answer in your own words, say Suggest for me and I will offer a few grounded options, or Skip. Skipping is allowed.";

const STEP_006A =
  "Don't Panic. That is the name of this phase. Now back to your site. You said this is your first site, and that you are brand new to all of this. Do you already have a logo, colors, fonts, or photos? Drop whatever you have. PDFs, screenshots, and links all work. A logo is the mark. Colors, fonts, and photos set the light and rhythm before any layout exists. Three ways forward. Answer: drop the files or describe what you have. Suggest for me: I will offer a few concrete options. Skip: leave this for later. Skipping is allowed.";

function question(ask: string): Question {
  return {
    id: "DP-0.4",
    module: "towel-check",
    depth: ["express", "standard", "deep"],
    ask,
    why: "Existing assets open a fast path.",
    input: ["upload", "text", "voice"],
    skipDefault: "No brand assets yet.",
    suggest: "Logo, palette, type, a written guide, and photos.",
    followUps: [],
    writes: ["ASSETS.md#brand-assets"],
  };
}

function card(ask: string, lead = "", help = ""): string {
  const state: CardState = {
    question: question(ask),
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

function heading(html: string): string {
  const match = /<h2 class="hh-qcard__title"[^>]*>([^<]*)<\/h2>/.exec(html);
  assert.ok(match?.[1]);
  return match[1];
}

test("step 003 and step 006a split into a short question", () => {
  const early = splitQuestionText(STEP_003);
  assert.match(early.lead, /Don't Panic\./);
  assert.match(early.lead, /So the question is about that one\./);
  assert.equal(early.question, "What do you love about that site, and what makes you wince?");
  assert.equal(early.help, "");
  assert.equal(early.question.length <= 200, true);

  const assets = splitQuestionText(STEP_006A);
  assert.match(assets.lead, /Don't Panic\./);
  assert.match(assets.lead, /brand new to all of this\./);
  assert.match(assets.question, /Do you already have a logo, colors, fonts, or photos\?/);
  assert.match(assets.question, /Drop whatever you have\./);
  assert.match(assets.question, /PDFs, screenshots, and links all work\./);
  assert.equal(assets.question.length <= 200, true);
  const prose = `${assets.lead}\n${assets.question}\n${assets.help}`;
  assert.equal(prose.includes("Suggest for me"), false);
  assert.equal(prose.includes("Skipping is allowed"), false);
  assert.equal(prose.includes("Three ways forward"), false);
  assert.equal(assets.question.includes("Don't Panic."), false);

  const html = card(assets.question, assets.lead, assets.help);
  const h2 = heading(html);
  assert.match(h2, /Do you already have a logo/);
  assert.equal(h2.includes("Don't Panic."), false);
  assert.equal(h2.includes("Skipping is allowed"), false);
  assert.equal(h2.includes("Suggest for me"), false);
  assert.match(html, /data-card-lead/);
  assert.equal(html.includes("!"), false);
});

test("every DP-0 and DP-1 ask stays under 200 characters in the heading", () => {
  const all = loadTree(treeFile);
  for (const item of all) {
    if (!/^DP-[01]\./.test(item.id)) continue;
    const parts = splitQuestionText(item.ask);
    assert.equal(parts.question.length > 0 && parts.question.length <= 200, true, item.id);
    assert.equal(parts.question.includes("Don't Panic."), false, item.id);
    const visible = `${parts.lead} ${parts.question} ${parts.help}`;
    assert.equal(visible.includes("Suggest for me"), false, item.id);
    if (item.id === "DP-0.3") assert.match(visible, /\(d\)/);
  }
});
