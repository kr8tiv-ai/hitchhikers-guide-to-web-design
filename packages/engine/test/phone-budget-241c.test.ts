/**
 * BUG-052 harness idea 23. A WebGL hero is rejected until the brief
 * records the phone performance budget. The budget does not ban the scene.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderBrief, type AnswerRecord } from "../src/required.ts";
import { translateBrief } from "../src/spec/art-direction.ts";
import { generateBriefPlan } from "../src/spec/brief-plan.ts";
import {
  PhoneBudgetError,
  phonePerformanceBudget,
} from "../src/spec/phone-budget.ts";

const WEBGL_BRIEF = `# Site Brief

## Vibe

Bold, tech, dark. The motion score is 8.

## Pages

Pages: Home.
`;

function record(id: string, status: AnswerRecord["status"], value: string): AnswerRecord {
  return { id, status, value };
}

test("a WebGL hero without the phone budget is rejected", () => {
  assert.throws(() => generateBriefPlan(WEBGL_BRIEF), PhoneBudgetError);
  const poisoned = `${WEBGL_BRIEF}\n## Phone performance budget\n\nNo WebGL on phones.\n`;
  assert.throws(() => generateBriefPlan(poisoned), PhoneBudgetError);
});

test("the phone budget keeps the scene and does not flip the style world", () => {
  const block = phonePerformanceBudget();
  assert.match(block, /## Phone performance budget/);
  assert.match(block, /at least 90/);
  assert.match(block, /2\.5 s/);
  assert.match(block, /0\.1/);
  assert.match(block, /5 MiB/);
  assert.match(block, /poster is the LCP image/i);
  assert.match(block, /GPU tier/);
  assert.equal(block.includes("!"), false);
  assert.doesNotMatch(block, /webgl|bold|tech|shader|\bdark\b/i);
  assert.doesNotMatch(block, /no webgl on phones|phones do not get the scene|disable the scene on phones|poster only on phones/i);

  const brief = `${WEBGL_BRIEF}\n${block}\n`;
  const planned = generateBriefPlan(brief);
  const webgl = planned.prompts.filter((prompt) =>
    prompt.library === "three" || prompt.library === "ogl" || prompt.library === "theatre",
  );
  assert.ok(webgl.length >= 1);
  const acceptance = (webgl[0]?.acceptance ?? []).join("\n");
  assert.match(acceptance, /The phone keeps the scene after the poster at a GPU tier\./);
  assert.match(acceptance, /One WebGL context on the page\./);
  assert.doesNotMatch(acceptance, /no webgl on phones/i);
  assert.equal(translateBrief(brief).styleWorld, "3d-world");
});

test("renderBrief adds the budget only when the brief already asks for a WebGL hero", () => {
  const calm = renderBrief([
    record("DP-2.1", "ANSWERED", "Book the tasting."),
    record("DP-2.6", "ANSWERED", "A local cook on a phone."),
    record("DP-2.2", "ANSWERED", "Reserve a seat."),
    record("DP-5.3", "SOFT", "quiet ink, never loud"),
    record("DP-6.2", "SKIPPED", "3. ASSUMED. Polished, not a spectacle."),
    record("DP-9.2", "ANSWERED", "no idea"),
  ]);
  assert.equal(calm.includes("Phone performance budget"), false);
  assert.equal(calm.includes("!"), false);

  const cinematic = renderBrief([
    record("DP-2.1", "ANSWERED", "Show the product."),
    record("DP-2.6", "ANSWERED", "A buyer on a phone."),
    record("DP-2.2", "ANSWERED", "Request a sample."),
    record("DP-5.3", "ANSWERED", "Bold, tech, dark."),
    record("DP-6.2", "ANSWERED", "The motion score is 8."),
    record("DP-9.2", "ANSWERED", "Vercel."),
  ]);
  const headings = ["## Goal", "## Visitor", "## Action", "## Vibe", "## Motion", "## Hosting"];
  let cursor = cinematic.indexOf("# Site Brief");
  for (const heading of headings) {
    const at = cinematic.indexOf(heading, cursor);
    assert.ok(at > cursor, heading);
    cursor = at + heading.length;
  }
  const budgetAt = cinematic.indexOf("## Phone performance budget");
  const coverageAt = cinematic.indexOf("Coverage:");
  assert.ok(budgetAt > cursor);
  assert.ok(budgetAt < coverageAt);
  assert.equal(cinematic.includes("!"), false);
  assert.equal(translateBrief(cinematic).styleWorld, "3d-world");
  assert.doesNotThrow(() => generateBriefPlan(cinematic));
});
