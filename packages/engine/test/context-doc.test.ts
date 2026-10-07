import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CONTEXT_ANCHORS,
  ContextDocError,
  GLOSS_WORD_CAP,
  TOKEN_CEILING,
  assembleContext,
  estimateTokens,
  type ContextGloss,
  type ContextInput,
} from "../src/spec/context-doc.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(here, "..", "src", "spec", "context-doc.ts");
const source = readFileSync(sourcePath, "utf8");

const HEADINGS = ["Identity", "Brand", "Voice", "Motion", "Stack", "Sections", "Rules"] as const;

function words(count: number): string {
  return Array.from({ length: count }, (_, index) => `w${index + 1}`).join(" ");
}

function gloss(overrides: Partial<ContextGloss> = {}): ContextGloss {
  return {
    brand: "Purpose lives in the brand file.",
    voice: "Traits and banned words live in the voice file.",
    motion: "Appetite and assignments live in the motion file.",
    stack: "The pick and the alternatives live in the stack file.",
    sections: "Each section has one job and one wow.",
    ...overrides,
  };
}

function sample(overrides: Partial<ContextInput> = {}): ContextInput {
  return {
    name: "Night Stall",
    siteWhy: "The stall exists so regulars can find the tea.",
    gloss: gloss(),
    ...overrides,
  };
}

function sectionBody(markdown: string, heading: string): string {
  const token = `## ${heading}\n`;
  const start = markdown.indexOf(token);
  assert.ok(start >= 0, heading);
  const bodyStart = start + token.length;
  const next = markdown.indexOf("\n## ", bodyStart);
  const body = next === -1 ? markdown.slice(bodyStart) : markdown.slice(bodyStart, next);
  return body.trim();
}

function anchorFor(key: keyof typeof CONTEXT_ANCHORS): string {
  const anchor = CONTEXT_ANCHORS[key];
  return `@.hitchhiker/${anchor.file}#${anchor.id}`;
}

test("estimateTokens uses words times 1.3", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("   \n\t  "), 0);
  assert.equal(estimateTokens("one two three four five six seven eight nine ten"), 13);
  assert.equal(estimateTokens("only"), 2);
});

test("assembleContext is a map of anchors, not a pasted spec", () => {
  const input = sample();
  const doc = assembleContext(input);
  assert.equal(doc.tokens, estimateTokens(doc.markdown));
  assert.ok(doc.tokens <= TOKEN_CEILING);
  assert.equal(doc.markdown.endsWith("\n"), true);
  assert.equal(doc.markdown.includes("\r"), false);
  assert.equal(doc.markdown.includes("!"), false);
  assert.equal(doc.markdown.includes("$10-20"), false);
  assert.equal(doc.markdown.includes("$10–20"), false);
  assert.equal(doc.markdown.toLowerCase().includes("lorem ipsum"), false);
  assert.match(sectionBody(doc.markdown, "Rules"), /^- no lorem$/m);
  assert.equal(doc.markdown.includes("### Three hundred"), false);

  const found = [...doc.markdown.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  assert.deepEqual(found, [...HEADINGS]);

  assert.equal(sectionBody(doc.markdown, "Identity"), `Name: ${input.name}\nWhy: ${input.siteWhy}`);
  assert.equal(
    sectionBody(doc.markdown, "Brand"),
    `${anchorFor("brand")}\n\n${input.gloss.brand}`,
  );
  assert.equal(
    sectionBody(doc.markdown, "Voice"),
    `${anchorFor("voice")}\n\n${input.gloss.voice}`,
  );
  assert.equal(
    sectionBody(doc.markdown, "Motion"),
    `${anchorFor("motion")}\n\n${input.gloss.motion}`,
  );
  assert.equal(
    sectionBody(doc.markdown, "Stack"),
    `${anchorFor("stack")}\n\n${input.gloss.stack}`,
  );
  assert.equal(
    sectionBody(doc.markdown, "Sections"),
    `${anchorFor("sections")}\n\n${input.gloss.sections}`,
  );

  assert.equal(anchorFor("brand"), "@.hitchhiker/BRAND.md#purpose");
  assert.equal(anchorFor("voice"), "@.hitchhiker/VOICE.md#voice");
  assert.equal(anchorFor("motion"), "@.hitchhiker/MOTION.md#motion");
  assert.equal(anchorFor("stack"), "@.hitchhiker/research/STACK-DECISION.md#stack-decision");
  assert.equal(anchorFor("sections"), "@.hitchhiker/SECTION-PLAN.md#section-plan");

  const rules = sectionBody(doc.markdown, "Rules");
  assert.match(rules, /no exclamation marks/);
  assert.match(rules, /one scroll owner/);
  const mentions = doc.markdown.match(/coexistence/gi) ?? [];
  assert.equal(mentions.length, 1);
  assert.match(rules, /### Coexistence/);
  assert.equal(sectionBody(doc.markdown, "Motion").toLowerCase().includes("coexistence"), false);
});

test("a 40-word gloss is kept and 41 throws", () => {
  assert.equal(GLOSS_WORD_CAP, 40);
  const kept = words(40);
  const doc = assembleContext(sample({ gloss: gloss({ brand: kept }) }));
  assert.equal(sectionBody(doc.markdown, "Brand").endsWith(kept), true);
  assert.match(doc.markdown, /^@.hitchhiker\/BRAND\.md#purpose$/m);

  assert.throws(
    () => assembleContext(sample({ gloss: gloss({ brand: words(41) }) })),
    (error: unknown) => {
      assert.ok(error instanceof ContextDocError);
      assert.match(error.message, /Gloss brand is 41 words/);
      assert.match(error.message, /cap is 40/);
      return true;
    },
  );
});

test("an empty gloss throws and is not trimmed down to fit", () => {
  for (const key of ["brand", "voice", "motion", "stack", "sections"] as const) {
    assert.throws(
      () => assembleContext(sample({ gloss: gloss({ [key]: "" }) })),
      (error: unknown) => {
        assert.ok(error instanceof ContextDocError);
        assert.match(error.message, new RegExp(`Gloss ${key} is empty`));
        return true;
      },
    );
    assert.throws(
      () => assembleContext(sample({ gloss: gloss({ [key]: "   " }) })),
      (error: unknown) => {
        assert.ok(error instanceof ContextDocError);
        assert.match(error.message, new RegExp(`Gloss ${key} is empty`));
        return true;
      },
    );
  }
});

test("a name with a newline throws", () => {
  for (const name of ["Night\nStall", "Night\r\nStall", "\n"]) {
    assert.throws(
      () => assembleContext(sample({ name })),
      (error: unknown) => {
        assert.ok(error instanceof ContextDocError);
        assert.match(error.message, /Name contains a newline/);
        return true;
      },
    );
  }
});

test("the token ceiling throws and the source does not read specs from disk", () => {
  assert.equal(TOKEN_CEILING, 30000);
  const bulky = words(24000);
  assert.throws(
    () => assembleContext(sample({ siteWhy: bulky })),
    (error: unknown) => {
      assert.ok(error instanceof ContextDocError);
      assert.match(error.message, /ceiling is 30000/);
      return true;
    },
  );

  assert.equal(source.includes("node:fs"), false);
  assert.equal(source.includes("readFile"), false);
  assert.equal(source.includes("$10-20"), false);
  assert.equal(source.includes("$10–20"), false);
  assert.equal(source.includes("compileBrand"), true);
  assert.match(source, /export function estimateTokens/);
  assert.match(source, /export function assembleContext/);
});

test("anchor ids match the headings the spec writers emit", () => {
  const src = path.resolve(here, "..", "src");
  const brand = readFileSync(path.join(src, "brand", "brain.ts"), "utf8");
  const voice = readFileSync(path.join(src, "brand", "voice.ts"), "utf8");
  const motion = readFileSync(path.join(src, "spec", "motion.ts"), "utf8");
  const stack = readFileSync(path.join(src, "spec", "stack.ts"), "utf8");
  const sections = readFileSync(path.join(src, "spec", "sections.ts"), "utf8");
  const prd = readFileSync(path.join(src, "spec", "prd.ts"), "utf8");

  assert.match(brand, /"# Purpose"/);
  assert.match(voice, /"# VOICE"/);
  assert.match(motion, /"# MOTION"/);
  assert.match(stack, /"# STACK-DECISION"/);
  assert.match(sections, /"# SECTION-PLAN"/);
  assert.match(stack, /research\/STACK-DECISION\.md/);
  assert.match(prd, /`\.hitchhiker\/research\/STACK-DECISION\.md`/);

  assert.equal(CONTEXT_ANCHORS.brand.id, "purpose");
  assert.equal(CONTEXT_ANCHORS.voice.id, "voice");
  assert.equal(CONTEXT_ANCHORS.motion.id, "motion");
  assert.equal(CONTEXT_ANCHORS.stack.id, "stack-decision");
  assert.equal(CONTEXT_ANCHORS.sections.id, "section-plan");
});
