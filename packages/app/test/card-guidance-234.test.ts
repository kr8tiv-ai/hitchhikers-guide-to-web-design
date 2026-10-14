/**
 * BUG-036 remainder. The AI price list belongs on DP-7.1.
 * Model-only lines never render on a card, including DP-6.3.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { GUIDANCE_MARKERS, INTERNAL_LINES as ENGINE_LINES, loadTree, type Question } from "@hitchhiker/engine";
import { renderCard, type CardState } from "../src/card.ts";
import { renderDeskMotion } from "../src/motion-previews/index.ts";
import { dropInternalCopy, INTERNAL_LINES, settleQuestionText } from "../src/question-parts.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const treeFile = path.resolve(here, "..", "..", "..", "interview", "tree.yaml");
const project4File = path.resolve(here, "..", "..", "engine", "test", "fixtures", "project4-interview.json");

const CLIP =
  "Do not promise 12 clips of 10 seconds at 1080p inside a $15 cap. That video alone is $30.00.";

/** The DP-6.3 wording on the project4 desk (step 751). The pace recap follows the DP-6.1 and DP-6.2 answers. */
const PROJECT4_FILM =
  "Your pace is already set. Gentle parallax stays on the hero, farm cards fade in one after another, and everything stays still when reduced motion is on. A continuous film is one long scroll, closer to the slow Kinfolk pages you liked. A branching story uses separate pages, so Dana can open farms, how buying works, or caretakers on her iPad. Do you want the whole site to be one continuous film you scroll through, or a branching story where visitors pick paths?";

interface Project4Answer {
  id: string;
  status: string;
  value: string;
}

function byId(all: readonly Question[], id: string): Question {
  const found = all.find((question) => question.id === id);
  assert.ok(found, id);
  return found;
}

function region(question: Question, modelAsk?: string): string {
  const parts = settleQuestionText(modelAsk ?? question.ask, question.ask);
  const state: CardState = {
    question: { ...question, ask: parts.question === "" ? question.ask : parts.question },
    draft: "",
    pushback: null,
    error: null,
    done: false,
    pending: false,
    ...(parts.lead === "" ? {} : { lead: parts.lead }),
    ...(parts.help === "" ? {} : { help: parts.help }),
  };
  return `${renderCard(state)}\n${renderDeskMotion(question.id)}`;
}

test("DP-6.3 in the project4 state has no price list and no model instruction", () => {
  const interview = JSON.parse(readFileSync(project4File, "utf8")) as { answers: Project4Answer[] };
  const pace = interview.answers.find((answer) => answer.id === "DP-6.1");
  const appetite = interview.answers.find((answer) => answer.id === "DP-6.2");
  assert.match(pace?.value ?? "", /parallax/);
  assert.equal(appetite?.value, "4.");

  const film = byId(loadTree(treeFile), "DP-6.3");
  const html = region(film, PROJECT4_FILM);
  assert.match(html, /branching story where visitors pick paths/);
  assert.match(html, /Scroll film|branching story/);
  assert.equal(html.includes("Do not promise"), false);
  assert.equal(html.includes(CLIP), false);
  assert.equal(html.includes("Imagine cost"), false);
  assert.equal(html.includes("hh-motion__costs"), false);
  assert.equal(html.includes("grok-imagine"), false);
  assert.equal(html.includes("$30.00"), false);
  assert.equal(html.includes("$0.02"), false);
});

test("DP-7.1 shows the price list and hides internal lines", () => {
  const budget = byId(loadTree(treeFile), "DP-7.1");
  const html = region(budget);
  assert.match(html, /How much are you OK spending on AI-made stills and videos/);
  assert.match(html, /hh-motion__costs/);
  assert.match(html, /grok-imagine-image/);
  assert.match(html, /\$0\.02/);
  assert.equal(html.includes("Do not promise"), false);
  assert.equal(html.includes(CLIP), false);
  assert.equal(html.includes("Show the model and the resolution on every line"), false);
  assert.equal(html.includes("Stop at the cap"), false);
  assert.equal(html.includes("Prices live on the cost meter"), false);
  assert.equal(html.includes("not in this question"), false);
});

test("no internal-marked text renders on any tree card", () => {
  assert.deepEqual(INTERNAL_LINES, ENGINE_LINES);
  assert.equal(INTERNAL_LINES[0], CLIP);
  assert.equal(dropInternalCopy(`A calm film. ${CLIP} Keep the words in the page.`, []), "A calm film. Keep the words in the page.");
  const all = loadTree(treeFile);
  const hits: string[] = [];
  for (const question of all) {
    const html = region(question).toLowerCase();
    for (const marker of GUIDANCE_MARKERS) {
      if (html.includes(marker)) hits.push(`${question.id}: ${marker}`);
    }
    const guidance = question.guidance?.trim() ?? "";
    if (guidance !== "" && html.includes(guidance.toLowerCase())) hits.push(`${question.id}: guidance`);
    if (html.includes(CLIP.toLowerCase())) hits.push(`${question.id}: clip guidance`);
  }
  assert.deepEqual(hits, []);
});
