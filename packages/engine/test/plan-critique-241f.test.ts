/**
 * BUG-055 idea 1. Tokens and an ASCII wireframe, then a critique that
 * asks whether any similar brief would produce this plan. A café, a
 * studio, and a clinic that differ only by the category word are rejected
 * before page prompts. No model call.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { generateBriefPlan } from "../src/spec/brief-plan.ts";
import {
  PlanCritiqueError,
  critiquePlan,
  draftPlan,
  plansSwapWithoutEdit,
} from "../src/spec/plan-critique.ts";

function genericBrief(kind: "café" | "studio" | "clinic", offer: string): string {
  return `# Site Brief

## Offer

A ${kind} in the city. ${offer}. Book a table.

## Pages

Pages: Home, Menu, Visit.

## Sections

Sections: hero, cards, testimonials, contact.
`;
}

const CAFE = genericBrief("café", "Coffee and pastries");
const STUDIO = genericBrief("studio", "Design and projects");
const CLINIC = genericBrief("clinic", "Care and patients");

const SPECIFIC = `# Site Brief

## Offer

Hearth & Rind ages clothbound cheddar above a 1924 kiln.

The counter is soapstone.

Tuesday tastings seat twelve.

## Pages

Pages: Home, Tasting, Kiln.
`;

test("a café, a studio, and a clinic swap without an edit and the critique rejects them", () => {
  const cafe = draftPlan(CAFE);
  const studio = draftPlan(STUDIO);
  const clinic = draftPlan(CLINIC);
  assert.match(cafe.wireframe, /[+][-]+[+]/);
  assert.match(cafe.wireframe, /\|/);
  assert.equal(typeof cafe.tokens.paper, "string");
  assert.equal(typeof cafe.tokens.ink, "string");
  assert.equal(plansSwapWithoutEdit(cafe, studio), true);
  assert.equal(plansSwapWithoutEdit(studio, clinic), true);
  assert.equal(plansSwapWithoutEdit(cafe, clinic), true);
  for (const draft of [cafe, studio, clinic]) {
    const critique = critiquePlan(draft);
    assert.equal(critique.pass, false);
    assert.deepEqual(critique.differences, []);
    assert.match(critique.failure, /similar brief/i);
  }
});

test("a specific plan names three concrete differences and may emit page prompts", () => {
  const draft = draftPlan(SPECIFIC);
  assert.match(draft.wireframe, /soapstone/i);
  assert.match(draft.wireframe, /1924/);
  const critique = critiquePlan(draft);
  assert.equal(critique.pass, true);
  assert.equal(critique.differences.length, 3);
  const joined = critique.differences.join("\n");
  assert.match(joined, /Hearth & Rind/);
  assert.match(joined, /soapstone/);
  assert.match(joined, /twelve/);
  assert.equal(/\bcaf[eé]\b|\bstudio\b|\bclinic\b/i.test(joined), false);
  const planned = generateBriefPlan(SPECIFIC);
  assert.ok(planned.prompts.some((prompt) => prompt.requirements.some((id) => id.startsWith("REQ-PAGE-"))));
});

test("a swappable plan is rejected before any page prompt", () => {
  assert.throws(() => generateBriefPlan(CAFE), PlanCritiqueError);
  assert.throws(() => generateBriefPlan(STUDIO), PlanCritiqueError);
  assert.throws(() => generateBriefPlan(CLINIC), PlanCritiqueError);
});
