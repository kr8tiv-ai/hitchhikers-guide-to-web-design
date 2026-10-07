/**
 * Live archetype, positioning, and one persona.
 * Prompt wording from Matt Haynes, Build a Brand From Scratch With AI
 * (AntiHero guide), Prompt 06, used with credit. D-005.
 * Shaped by pickArchetype, positioningLine, and buildStory (046).
 * Checked with buildTeardown (047) and competitor slogans from the crawl.
 */

import type { think } from "../../ai/think.ts";
import type { ThinkRequest } from "../../ai/think.ts";
import { buildStory, pickArchetype, positioningLine } from "../story.ts";
import { buildTeardown } from "../teardown.ts";
import { evidenceFromAnswers } from "../truth.ts";
import { compileWhy } from "../why.ts";
import { recordDraftItems } from "./approve.ts";
import {
  BRAND_POSITIONING_TASK,
  CompetitorSloganError,
  LiveShapeError,
  POSITIONING_SCHEMA,
  answerLines,
  archetypeLabel,
  assertBrandContrast,
  assertClaims,
  assertCleanProse,
  competitorPhrases,
  isRecord,
  latestValue,
  readString,
  sloganMatch,
  type BrandFacts,
} from "./schemas.ts";

export interface PositioningDraft {
  archetype: string;
  archetypeStatus: "ASSUMED";
  positioning: string;
  persona: { name: string; summary: string };
  nonCustomers: [string, string, string];
  teardownMarkdown: string;
}

interface ModelPositioning {
  archetype: string;
  positioning: string;
  persona: { name: string; summary: string };
  nonCustomers: [string, string, string];
}

export async function draftPositioning(
  brand: BrandFacts,
  deps: { think: typeof think },
): Promise<PositioningDraft> {
  assertBrandContrast(brand);
  const first = parsePositioning((await deps.think(request(brand))).value);
  const shaped = first === null ? null : tryShape(brand, first);
  const draft = shaped ?? (await repair(brand, deps));
  if (brand.projectDir !== undefined && brand.projectDir.trim() !== "") {
    await recordDraftItems(brand.projectDir, [
      { itemId: "archetype", kind: "archetype", text: draft.archetype },
      { itemId: "positioning", kind: "positioning", text: draft.positioning },
      { itemId: "persona", kind: "persona", text: `${draft.persona.name}. ${draft.persona.summary}` },
      ...draft.nonCustomers.map((person, index) => ({
        itemId: `non-customer:${index + 1}`,
        kind: "non-customer",
        text: person,
      })),
    ]);
  }
  return draft;
}

async function repair(brand: BrandFacts, deps: { think: typeof think }): Promise<PositioningDraft> {
  const second = parsePositioning(
    (await deps.think(request(brand, "Use one of the 12 archetypes. Do not repeat a competitor slogan."))).value,
  );
  if (second === null) throw new LiveShapeError("Positioning did not match the schema.");
  try {
    return shape(brand, second);
  } catch (error) {
    if (error instanceof CompetitorSloganError) throw error;
    throw new LiveShapeError("Positioning failed the shaper.");
  }
}

function tryShape(brand: BrandFacts, model: ModelPositioning): PositioningDraft | null {
  try {
    return shape(brand, model);
  } catch {
    return null;
  }
}

function shape(brand: BrandFacts, model: ModelPositioning): PositioningDraft {
  const why = compileWhy(brand.answers);
  const pack = buildStory({ answers: [...brand.answers], why, name: brand.name });
  pickArchetype(`${model.archetype}\n${model.positioning}\n${model.persona.summary}`);
  const label = archetypeLabel(model.archetype) ?? pack.archetype;
  const line = positioningLine({
    visitor: latestValue(brand.answers, "DP-2.6"),
    offer: latestValue(brand.answers, "DP-2.7"),
    name: brand.name,
    siteWhy: why.siteWhy,
  });
  const teardown = buildTeardown({
    reportMarkdown: brand.competitorReport ?? "",
    envy: brand.envy ?? latestValue(brand.answers, "DP-4.2"),
    boredom: brand.boredom ?? "",
  });
  const phrases = competitorPhrases(brand);
  const positioning = choosePositioning(model.positioning, line, brand, phrases);
  const slogan = sloganMatch(`${model.persona.name} ${model.persona.summary}`, phrases);
  if (slogan !== null) throw new CompetitorSloganError(slogan);
  assertCleanProse("archetype", label);
  assertCleanProse("positioning", positioning);
  assertCleanProse("persona", `${model.persona.name} ${model.persona.summary}`);
  for (const person of model.nonCustomers) assertCleanProse("non-customer", person);
  const markdown = [
    label,
    positioning,
    model.persona.name,
    model.persona.summary,
    ...model.nonCustomers,
    teardown.markdown,
  ].join("\n");
  assertClaims(markdown, evidenceFromAnswers([...brand.answers]));
  return {
    archetype: label,
    archetypeStatus: "ASSUMED",
    positioning,
    persona: model.persona,
    nonCustomers: model.nonCustomers,
    teardownMarkdown: teardown.markdown,
  };
}

function choosePositioning(
  modelLine: string,
  shaperLine: string,
  brand: BrandFacts,
  phrases: readonly string[],
): string {
  const visitor = latestValue(brand.answers, "DP-2.6").trim().toLowerCase();
  const offer = latestValue(brand.answers, "DP-2.7").trim().toLowerCase();
  const folded = modelLine.toLowerCase();
  const grounded = visitor !== "" && offer !== "" && folded.includes(visitor) && folded.includes(offer);
  const modelSlogan = sloganMatch(modelLine, phrases);
  if (modelSlogan !== null) throw new CompetitorSloganError(modelSlogan);
  if (grounded) {
    assertCleanProse("positioning", modelLine);
    return modelLine;
  }
  const shaperSlogan = sloganMatch(shaperLine, phrases);
  if (shaperSlogan !== null) throw new CompetitorSloganError(shaperSlogan);
  return shaperLine;
}

function request(brand: BrandFacts, repair?: string): ThinkRequest<ModelPositioning> {
  const lines = [
    "From the 12 brand archetypes (Innocent, Everyman, Hero, Outlaw, Explorer, Creator, Ruler, Magician, Lover, Caregiver, Jester, Sage), recommend one primary archetype.",
    "Write one positioning statement.",
    "Build one specific persona: a name and a summary of their day, what they have tried, and what they are sick of.",
    "List 3 people who are not the customer.",
    "Do not copy a competitor slogan, logo, or color.",
    "Do not invent testimonials, awards, metrics, or client names.",
    "No exclamation marks. No em dashes.",
    `Brand: ${brand.name}`,
    "Answers:",
    answerLines(brand.answers),
    "Competitor phrases to avoid:",
    competitorPhrases(brand).join("\n") || "(none)",
  ];
  if (repair !== undefined) lines.push(repair);
  return { task: BRAND_POSITIONING_TASK, schema: POSITIONING_SCHEMA, input: lines.join("\n") };
}

function parsePositioning(value: unknown): ModelPositioning | null {
  if (!isRecord(value) || !isRecord(value.persona) || !Array.isArray(value.nonCustomers)) return null;
  if (value.nonCustomers.length !== 3) return null;
  try {
    const nonCustomers = value.nonCustomers.map((item, index) => readString(item, `nonCustomers.${index}`));
    if (nonCustomers.some((item) => item === "")) return null;
    const personaName = readString(value.persona.name, "persona.name");
    const summary = readString(value.persona.summary, "persona.summary");
    const archetype = readString(value.archetype, "archetype");
    const positioning = readString(value.positioning, "positioning");
    if (personaName === "" || summary === "" || archetype === "" || positioning === "") return null;
    return {
      archetype,
      positioning,
      persona: { name: personaName, summary },
      nonCustomers: [nonCustomers[0] ?? "", nonCustomers[1] ?? "", nonCustomers[2] ?? ""],
    };
  } catch {
    return null;
  }
}
