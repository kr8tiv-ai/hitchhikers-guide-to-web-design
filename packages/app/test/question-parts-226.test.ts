/**
 * BUG-036, BUG-025, and BUG-035. Headings are questions. Internal guidance stays off the card.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { GUIDANCE_MARKERS as ENGINE_MARKERS, TYPE_PAIRINGS, loadTree, type Question } from "@hitchhiker/engine";
import { GUIDANCE_MARKERS } from "../src/question-parts.ts";
import { renderCard, type CardState } from "../src/card.ts";
import { isFullQuestion, settleQuestionText } from "../src/question-parts.ts";

const treeFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "interview", "tree.yaml");

const DP71_RECAP =
  "You are brand new, this is the first site, and it is your own business: Paradise Found, Find your calm, connecting expats to ocean-view Costa Rican farms through a lawyer-led direct purchase.";
const DP71_ASK =
  "How much are you OK spending on AI-made stills and videos? $0, a little, a fair amount, or you name it.";
const DP71_GUIDANCE =
  "Show the model and the resolution on every line. Do not promise 1080p inside a small cap. Prices live on the cost meter, not in this question. Stop at the cap.";

const STEP_633 =
  "Dana, on an iPad, still needs one clear thing to ask about. : What do you sell or give away, and why should anyone care?";
const STEP_617 =
  "The wide caps in paradise-found-logo.png still need a letter style. : Do you have fonts you use? If not, pick a style from these examples.";
const STEP_643 =
  "Here is what I heard. Private counting tallies visits. We'll count visitors privately. Change?";
const OFFER = "What do you sell or give away, and why should anyone care?";
const FONTS = "Do you have fonts you use? If not, pick a style from these examples.";
const ANALYTICS = "We'll count visitors privately. Change?";

function question(partial: Partial<Question> & Pick<Question, "id" | "ask" | "why">): Question {
  return {
    module: "limits",
    depth: ["deep"],
    input: ["text"],
    skipDefault: "Skip.",
    writes: ["SITE-BRIEF.md#field"],
    ...partial,
  };
}

function card(state: Partial<CardState> & Pick<CardState, "question">): string {
  return renderCard({
    draft: "",
    pushback: null,
    error: null,
    done: false,
    pending: false,
    ...state,
  });
}

function heading(html: string): string {
  const match = /<h2 class="hh-qcard__title"[^>]*>([^<]*)<\/h2>/.exec(html);
  assert.ok(match?.[1], html);
  return match[1]
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'");
}

test("the DP-7.1 recap heading falls back to the tree question", () => {
  const parts = settleQuestionText(DP71_RECAP, DP71_ASK);
  assert.equal(parts.question, DP71_ASK);
  assert.equal(parts.lead, DP71_RECAP);
  assert.equal(parts.question.includes("Paradise Found"), false);
  const html = card({
    question: question({ id: "DP-7.1", ask: parts.question, why: "Name a ceiling, including zero. The cost meter shows what that ceiling can buy.", guidance: DP71_GUIDANCE }),
    lead: parts.lead,
    help: `${DP71_GUIDANCE} : ${DP71_ASK}`,
  });
  assert.equal(heading(html), DP71_ASK);
  assert.equal(html.includes("Show the model and the resolution on every line"), false);
  assert.equal(html.includes("Do not promise 1080p"), false);
  assert.equal(html.includes("Stop at the cap"), false);
  assert.equal(html.includes("not in this question"), false);
  assert.match(html, /aria-labelledby="hh-card-ask"/);
  assert.equal(html.includes(" : "), false);
});

test("internal guidance never appears in card HTML", () => {
  const html = card({
    question: question({
      id: "DP-9.2",
      ask: "Do you own a web address (like yourbakery.com)? Hostinger is recommended. Vercel, Netlify, and Cloudflare are equal choices. No idea is fine.",
      why: "Hostinger is the recommended word, not a forced value. Vercel, Netlify, and Cloudflare are equal choices. No idea is a complete answer.",
      guidance: "Hostinger is the recommended word, not a forced value.",
    }),
    help: "Hostinger is the recommended word, not a forced value.",
    lead: "Show the model and the resolution on every line.",
  });
  assert.equal(html.includes("not a forced value"), false);
  assert.equal(html.includes("recommended word"), false);
  assert.equal(html.includes("Show the model and the resolution on every line"), false);
  assert.match(html, /equal choices/);
  assert.equal(heading(html).includes("not a forced value"), false);
});

test("step 617, 633, and 643 keep the question in the heading and the lead apart", () => {
  const offer = settleQuestionText(STEP_633, OFFER);
  assert.equal(offer.question, OFFER);
  assert.equal(offer.lead, "Dana, on an iPad, still needs one clear thing to ask about.");
  assert.equal(offer.question.includes(" : "), false);
  assert.equal(offer.lead.includes(OFFER), false);

  const fonts = settleQuestionText(STEP_617, FONTS);
  assert.equal(fonts.question, FONTS);
  assert.equal(fonts.lead, "The wide caps in paradise-found-logo.png still need a letter style.");
  assert.equal(fonts.question.includes(" : "), false);

  const change = settleQuestionText("Change?", ANALYTICS);
  assert.equal(change.question, ANALYTICS);
  assert.equal(change.question === "Change?", false);

  const recap = settleQuestionText(STEP_643, ANALYTICS);
  assert.equal(recap.question, ANALYTICS);
  assert.match(recap.lead, /Here is what I heard/);
  assert.equal(recap.lead.includes("Change?"), false);
  assert.equal(recap.question.includes(" : "), false);

  const logo = "Using the logo you gave earlier (paradise-found-logo.png). Change?";
  const kept = settleQuestionText(logo, "Do you have a logo?");
  assert.equal(kept.question, logo);
  assert.equal(kept.lead, "");
  const prose = settleQuestionText(
    "Using the wide caps in paradise-found-logo.png still need a letter style. Change?",
    "Do you have a logo?",
  );
  assert.equal(prose.question, "Do you have a logo?");
  assert.equal(prose.question.includes("Change?"), false);
});

test("DP-1.5 renders six font examples and other cards do not", () => {
  const all = loadTree(treeFile);
  const fonts = all.find((item) => item.id === "DP-1.5");
  const offer = all.find((item) => item.id === "DP-2.7");
  assert.ok(fonts);
  assert.ok(offer);
  const fontCard = card({ question: fonts });
  assert.equal(fontCard.split("data-font-sample=").length - 1, 6);
  assert.match(fontCard, /Bebas Neue \+ Barlow/);
  assert.match(fontCard, /DM Serif Display \+ DM Sans/);
  assert.match(fontCard, /Clash Display \+ Satoshi/);
  assert.match(fontCard, /aria-label="Font examples"/);
  assert.match(fontCard, /Find your calm/);
  assert.equal(fontCard.includes("fonts.googleapis"), false);
  assert.equal(fontCard.includes("fontshare"), false);
  assert.deepEqual(GUIDANCE_MARKERS, ENGINE_MARKERS);
  for (const pair of TYPE_PAIRINGS) {
    assert.match(fontCard, new RegExp(pair[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(fontCard, new RegExp(pair[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  const offerCard = card({ question: offer });
  assert.equal(offerCard.includes("data-font-sample"), false);
  assert.equal(heading(offerCard).includes(" : "), false);
});

test("a stubbed run never puts a colon join or a fragment in the h2", () => {
  const all = loadTree(treeFile);
  const stubs = [
    { id: "DP-7.1", text: DP71_RECAP },
    { id: "DP-2.7", text: STEP_633 },
    { id: "DP-1.5", text: STEP_617 },
    { id: "DP-3.8", text: STEP_643 },
    { id: "DP-3.8", text: "Change?" },
    { id: "DP-9.2", text: "Hostinger is the recommended word, not a forced value. Do you own a web address?" },
  ];
  for (const item of all) stubs.push({ id: item.id, text: item.ask });
  for (const stub of stubs) {
    const base = all.find((item) => item.id === stub.id);
    assert.ok(base, stub.id);
    const parts = settleQuestionText(stub.text, base.ask);
    const html = card({
      question: question({ id: base.id, ask: parts.question, why: base.why, guidance: base.guidance }),
      lead: parts.lead,
      help: parts.help,
    });
    const h2 = heading(html);
    assert.equal(h2.includes(" : "), false, `${stub.id}: ${h2}`);
    assert.equal(h2 === "Change?", false, stub.id);
    const trusted = h2 === base.ask || isFullQuestion(h2);
    assert.equal(trusted, true, `${stub.id}: ${h2}`);
    assert.equal(html.includes("Show the model and the resolution on every line"), false, stub.id);
    assert.equal(html.includes("not a forced value"), false, stub.id);
  }
});
