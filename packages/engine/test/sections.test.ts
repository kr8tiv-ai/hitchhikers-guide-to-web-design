import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { planMotion } from "../src/spec/motion.ts";
import {
  SectionsError,
  planSections,
  type EffectRequest,
  type PageInput,
} from "../src/spec/sections.ts";

const HOME: PageInput = {
  id: "home",
  title: "Home",
  purpose: "Open with the offer and the place.",
};

const VISIT: PageInput = {
  id: "visit",
  title: "Visit",
  purpose: "Tell people how to find the stall tonight.",
};

const FALLBACK = "The stage stays in words under the model so a reader never needs the picture.";
const EXACT_20 = "Crawlable text here.";

function block(markdown: string, id: string): string {
  const marker = `### ${id}\n`;
  const start = markdown.indexOf(marker);
  assert.ok(start >= 0, id);
  const rest = markdown.slice(start + marker.length);
  const next = /\n#{2,3} /.exec(rest);
  return next?.index === undefined ? rest : rest.slice(0, next.index);
}

function wows(section: string): string[] {
  return section.split("\n").filter((line) => line.startsWith("- Wow:"));
}

function assertClean(markdown: string): void {
  assert.equal(markdown.includes("!"), false);
  assert.equal(markdown.includes("\r"), false);
  assert.equal(/\blorem\b/i.test(markdown), false);
  assert.equal(markdown.includes("Heart of Gold"), false);
  assert.equal(markdown.endsWith("\n"), true);
}

test("planSections is exported", () => {
  assert.equal(typeof planSections, "function");
});

test("the module does not name the hero Heart of Gold", () => {
  const source = readFileSync(new URL("../src/spec/sections.ts", import.meta.url), "utf8");
  assert.equal(source.includes("Heart of Gold"), false);
  assert.match(source, /export function planSections/);
  assert.match(source, /Infinite Improbability/);
});

test("a two-page plan names the hero Infinite Improbability and gives each section one wow", () => {
  const effects: EffectRequest[] = [
    { sectionId: "hero", effectId: "orbit" },
    { sectionId: "visit", effectId: "rise" },
  ];
  const { sectionPlan, visual } = planSections({
    pages: [HOME, VISIT],
    assignments: [
      { id: "orbit", library: "three", element: "stage" },
      { id: "rise", library: "gsap", element: "headline" },
    ],
    effects,
    textFallbacks: { orbit: FALLBACK },
  });
  assertClean(sectionPlan);
  assertClean(visual);

  const hero = block(sectionPlan, "hero");
  const visit = block(sectionPlan, "visit");
  assert.match(hero, /^- Slice: Infinite Improbability$/m);
  assert.match(hero, /^- Name: Infinite Improbability$/m);
  assert.match(hero, /^- Job: Open with the offer and the place\.$/m);
  assert.match(hero, /^- Wow: orbit$/m);
  assert.match(hero, /^- Library: three$/m);
  assert.match(hero, /^- Element: stage$/m);
  assert.match(hero, new RegExp(`^- Text: ${FALLBACK.replace(/[.]/g, "\\.")}$`, "m"));
  assert.match(hero, /outside the WebGL context/);
  assert.deepEqual(wows(hero), ["- Wow: orbit"]);

  assert.match(visit, /^- Slice: none$/m);
  assert.match(visit, /^- Name: Tell people how to find the stall tonight\.$/m);
  assert.match(visit, /^- Wow: rise$/m);
  assert.match(visit, /^- Library: gsap$/m);
  assert.match(visit, /^- Element: headline$/m);
  assert.match(visit, /^- Text: Tell people how to find the stall tonight\.$/m);
  assert.equal(visit.includes("WebGL"), false);
  assert.deepEqual(wows(visit), ["- Wow: rise"]);
  assert.match(visual, /Hero slice: Infinite Improbability/);
});

test("one motion-plan effect lands on the hero and keeps that library name", () => {
  const motion = planMotion({
    requests: [{ id: "orbit", kind: "three-hero", element: "stage", page: "home" }],
    appetite: 8,
    stack: "astro",
  });
  const orbit = motion.assignments.find((item) => item.library === "three");
  assert.ok(orbit);
  assert.ok(motion.assignments.length > 1);

  assert.throws(
    () =>
      planSections({
        pages: [HOME],
        assignments: motion.assignments,
        textFallbacks: { orbit: FALLBACK },
      }),
    (error: unknown) => {
      assert.ok(error instanceof SectionsError);
      assert.match(error.message, /Do not guess/);
      return true;
    },
  );

  const { sectionPlan } = planSections({
    pages: [HOME, VISIT],
    assignments: [orbit],
    textFallbacks: { orbit: FALLBACK },
  });
  const hero = block(sectionPlan, "hero");
  const visit = block(sectionPlan, "visit");
  assert.match(hero, new RegExp(`^- Library: ${orbit.library}$`, "m"));
  assert.match(hero, /^- Wow: orbit$/m);
  assert.match(hero, /^- Element: stage$/m);
  assert.match(hero, /Infinite Improbability/);
  assert.match(visit, /^- Wow: none$/m);
  assert.match(visit, /^- Library: none$/m);
  assert.equal(sectionPlan.includes("Heart of Gold"), false);
});

test("two effects on one section throw", () => {
  assert.throws(
    () =>
      planSections({
        pages: [HOME],
        assignments: [
          { id: "orbit", library: "three", element: "stage" },
          { id: "rise", library: "gsap", element: "headline" },
        ],
        effects: [
          { sectionId: "hero", effectId: "orbit" },
          { sectionId: "hero", effectId: "rise" },
        ],
        textFallbacks: { orbit: FALLBACK },
      }),
    (error: unknown) => {
      assert.ok(error instanceof SectionsError);
      assert.match(error.message, /cannot have two effects/);
      assert.match(error.message, /orbit/);
      assert.match(error.message, /rise/);
      return true;
    },
  );
});

test("an unplaced effect throws", () => {
  assert.throws(
    () =>
      planSections({
        pages: [HOME, VISIT],
        assignments: [
          { id: "orbit", library: "three", element: "stage" },
          { id: "rise", library: "gsap", element: "headline" },
        ],
        effects: [{ sectionId: "hero", effectId: "orbit" }],
        textFallbacks: { orbit: FALLBACK },
      }),
    (error: unknown) => {
      assert.ok(error instanceof SectionsError);
      assert.match(error.message, /rise/);
      assert.match(error.message, /not placed/);
      return true;
    },
  );
});

test("three and theatre without a long text fallback throw", () => {
  const pages = [HOME];
  const three = [{ id: "orbit", library: "three", element: "stage" }];
  const theatre = [{ id: "reel", library: "theatre", element: "timeline" }];

  assert.throws(
    () => planSections({ pages, assignments: three, textFallbacks: {} }),
    /text fallback of at least 20/,
  );
  assert.throws(
    () => planSections({ pages, assignments: three, textFallbacks: { orbit: "Crawlable text here" } }),
    /text fallback of at least 20/,
  );
  assert.throws(
    () => planSections({ pages, assignments: theatre, textFallbacks: {} }),
    /text fallback of at least 20/,
  );

  const passed = planSections({
    pages,
    assignments: theatre,
    textFallbacks: { reel: EXACT_20 },
  });
  assert.equal(EXACT_20.length, 20);
  assert.match(block(passed.sectionPlan, "hero"), /^- Library: theatre$/m);
  assert.match(passed.sectionPlan, /^- Text: Crawlable text here\.$/m);
  assert.match(passed.sectionPlan, /outside the WebGL context/);
});

test("a light library does not require a text fallback", () => {
  const { sectionPlan } = planSections({
    pages: [HOME],
    assignments: [{ id: "wash", library: "ogl", element: "grain" }],
    textFallbacks: {},
  });
  const hero = block(sectionPlan, "hero");
  assert.match(hero, /^- Library: ogl$/m);
  assert.match(hero, /^- Text: Open with the offer and the place\.$/m);
  assert.equal(hero.includes("WebGL"), false);
});

test("an empty purpose, a duplicate page id, and no pages throw", () => {
  assert.throws(
    () =>
      planSections({
        pages: [{ id: "home", title: "Home", purpose: "  \n  " }],
        assignments: [],
        textFallbacks: {},
      }),
    (error: unknown) => {
      assert.ok(error instanceof SectionsError);
      assert.match(error.message, /purpose/);
      return true;
    },
  );
  assert.throws(
    () =>
      planSections({
        pages: [HOME, { id: "home", title: "Again", purpose: "Tell people how to find the stall tonight." }],
        assignments: [],
        textFallbacks: {},
      }),
    /Duplicate page id "home"/,
  );
  assert.throws(
    () => planSections({ pages: [], assignments: [], textFallbacks: {} }),
    /At least one page is required/,
  );
});

test("visual direction records light, type, and the signature moment, or Not decided", () => {
  const bare = planSections({ pages: [HOME], assignments: [], textFallbacks: {} });
  assert.match(bare.visual, /Hero slice: Infinite Improbability/);
  assert.match(bare.visual, /## Light\n\nNot decided\./);
  assert.match(bare.visual, /## Type\n\nNot decided\./);
  assert.match(bare.visual, /## Signature moment\n\nNot decided\./);
  assert.equal(bare.visual.includes("Heart of Gold"), false);

  const filled = planSections({
    pages: [HOME],
    assignments: [],
    textFallbacks: {},
    answers: {
      light: "Paper and ink.",
      type: "Loud headlines beside quiet body text.",
      signature: "The window turns once at dusk.",
    },
  });
  assert.match(filled.visual, /## Light\n\nPaper and ink\./);
  assert.match(filled.visual, /## Type\n\nLoud headlines beside quiet body text\./);
  assert.match(filled.visual, /## Signature moment\n\nThe window turns once at dusk\./);
  assert.equal(filled.visual.includes("Not decided."), false);
  assert.match(filled.visual, /Hero slice: Infinite Improbability/);

  const partial = planSections({
    pages: [HOME],
    assignments: [],
    textFallbacks: {},
    answers: {
      light: "   ",
      type: "Quiet serif.",
      signature: "The window turns once at dusk.",
    },
  });
  assert.equal(partial.visual.split("Not decided.").length - 1, 1);
  assert.match(partial.visual, /## Light\n\nNot decided\./);
  assert.match(partial.visual, /## Type\n\nQuiet serif\./);
});
