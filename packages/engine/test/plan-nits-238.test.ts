/**
 * Checkpoint 238 nits. Coverage names what it counts.
 * One brief feature is one requirement.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { recordedField } from "../src/guide/brief-loop.ts";
import type { Facts } from "../src/guide/schemas.ts";
import { planFromBrief } from "../src/spec/brief-plan.ts";
import { planCoverageRows } from "../src/spec/plan-coverage.ts";

const RUN4 = `# Site Brief

## Pages

Pages: Home; Farms; Contact.

## Features

Listing filters (price range, acres, region, ocean view, water source, caretaker available, road access) with a results count, clear filters, empty state, and filters kept in the URL. Sort by price low or high, acres, or newest. A map on Farms and on each farm page. Favorites shortlist in local storage. Footer newsletter.

## Decisions

DP-3.1: Yes. A general contact form plus the farm inquiry form.
DP-3.4: Yes, a footer newsletter: email field and a success message.
DP-4.5: Yes: write so AI assistants can recommend us, with an llms.txt and FAQ structured data.
`;

test("the brief coverage count says it is counting answers", () => {
  const answers = Array.from({ length: 62 }, (_, index) => ({
    id: `DP-${index}.1`,
    value: "A recorded answer.",
  }));
  const facts: Facts = { answers, uploads: [], crawlNotes: [] };
  const line = recordedField("coverage", facts).text;
  assert.match(line, /^Covered 62 of 62 answers\./);
  assert.equal(line.includes("!"), false);
});

test("the Run 4 brief shape has one requirement per feature and no duplicate labels", () => {
  const planned = planFromBrief(RUN4);
  const labels = planned.requirements.map((item) => item.label);
  assert.equal(new Set(labels).size, labels.length);
  assert.equal(planned.features.filter((name) => /contact form/i.test(name)).length, 1);
  assert.equal(planned.features.includes("general contact form"), true);
  assert.equal(planned.features.includes("contact form"), false);
  assert.equal(planned.features.filter((name) => /newsletter/i.test(name)).length, 1);
  assert.equal(planned.features.includes("footer newsletter signup"), true);
  assert.equal(planned.features.includes("llms.txt and FAQ JSON-LD"), false);
  assert.equal(planned.features.includes("llms.txt"), true);
  assert.equal(planned.features.includes("FAQ structured data"), true);
  const rows = planCoverageRows(
    planned.requirements,
    planned.requirements.map((item) => ({ requirements: [item.id], promptId: "001" })),
  );
  const rowLabels = rows.map((row) => row.label);
  assert.equal(new Set(rowLabels).size, rowLabels.length);
});

test("a brief that only says contact form keeps that label", () => {
  const planned = planFromBrief(
    "# Site Brief\n\n## Pages\n\nPages: Home.\n\n## Decisions\n\nDP-3.1: Yes, a contact form on the contact page.\n",
  );
  assert.equal(planned.features.includes("contact form"), true);
  assert.equal(planned.features.includes("general contact form"), false);
});
