import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { prepareSiteBuild } from "../src/guide/site-build.ts";
import { estimateTokens } from "../src/spec/context-doc.ts";
import {
  DESIGN_GATE_TOKEN_CAP,
  DESIGN_PATTERN_TOKEN_CAP,
} from "../src/spec/design-language.ts";
import { generateBriefPlan } from "../src/spec/brief-plan.ts";
import { removeTempDir } from "./remove-temp.ts";

const BRIEF = `# Site Brief

## Vibe

Calm, warm, honest, like Kinfolk.

## Pages

Pages: Home.

## Facts

The valley is the only place named in the interview.
`;

test("a rendered hero prompt carries design language under the cap", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-design-239-"));
  try {
    mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
    writeFileSync(
      path.join(dir, ".hitchhiker", "ASSETS.md"),
      [
        "| slot | source | file | cost | approved | license | status | grade | job |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
        "| hero | imagine | src/assets/generated/hero.webp | 0 | yes | generated | ready |  |  |",
        "",
      ].join("\n"),
      "utf8",
    );
    await prepareSiteBuild(dir, BRIEF);
    const hero = generateBriefPlan(BRIEF).prompts.find((prompt) => prompt.requirements.includes("REQ-STRUCT-hero"));
    const image = generateBriefPlan(BRIEF).prompts.find((prompt) => prompt.requirements.includes("REQ-IMAGE-hero"));
    assert.ok(hero && image);
    const text = readFileSync(path.join(dir, ".hitchhiker", "prompts", `${hero.id}.md`), "utf8");
    const imageText = readFileSync(path.join(dir, ".hitchhiker", "prompts", `${image.id}.md`), "utf8");
    assert.match(text, /## Design language/);
    assert.match(text, /Build the homepage hero with real copy and room for the motion the art direction names/);
    assert.match(text, /### Art direction/);
    assert.match(text, /Kinfolk/);
    assert.match(text, /Technique:/);
    assert.match(text, /never copy a reference wholesale/);
    assert.equal(text.includes("{{"), false);
    assert.equal(/[A-Za-z]:[\\/]/.test(text), false);
    assert.equal(text.includes("/Users/"), false);
    assert.equal(text.includes("/home/"), false);
    assert.match(imageText, /src\/assets\/generated\/hero\.webp/);
    const design = text.split("## Design language")[1] ?? "";
    const example = design.split("### Example")[1]?.split("### Technique notes")[0] ?? "";
    const notes = design.split("### Technique notes")[1]?.split("### Gates")[0] ?? "";
    const gates = design.split("### Gates")[1] ?? "";
    assert.ok(estimateTokens(`${example}\n${notes}`) <= DESIGN_PATTERN_TOKEN_CAP);
    assert.ok(estimateTokens(gates) <= DESIGN_GATE_TOKEN_CAP);
    assert.match(gates, /Reduced motion stays visible and complete/);
    assert.match(gates, /phone Lighthouse at least 90/);
  } finally {
    removeTempDir(dir);
  }
});
