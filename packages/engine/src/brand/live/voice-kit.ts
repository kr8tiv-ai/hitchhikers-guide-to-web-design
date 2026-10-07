/**
 * Live voice kit.
 * Prompt wording from Matt Haynes, Build a Brand From Scratch With AI
 * (AntiHero guide), Prompt 14, used with credit. D-005.
 * renderVoice (051) writes the file. The model supplies traits, vocabulary, and microcopy.
 */

import type { think } from "../../ai/think.ts";
import type { ThinkRequest } from "../../ai/think.ts";
import { positioningLine } from "../story.ts";
import { evidenceFromAnswers } from "../truth.ts";
import { compileWhy } from "../why.ts";
import { BANNED_WORDS, renderVoice } from "../voice.ts";
import { recordDraftItems, type ApprovalDraft } from "./approve.ts";
import {
  BRAND_VOICE_TASK,
  LiveShapeError,
  VOICE_SCHEMA,
  answerLines,
  assertBrandContrast,
  assertClaims,
  assertCleanProse,
  isRecord,
  latestValue,
  readString,
  type BrandFacts,
} from "./schemas.ts";

export interface VoiceKit {
  markdown: string;
  traits: [string, string, string];
  vocabulary: { use: string[]; never: string[] };
  banned: string[];
  microcopy: { button: string; error: string; empty: string; notFound: string };
  assumed: boolean;
}

interface VoiceModel {
  traits: [{ this: string; not: string }, { this: string; not: string }, { this: string; not: string }];
  use: string[];
  never: string[];
  microcopy: VoiceKit["microcopy"];
}

export async function draftVoiceKit(brand: BrandFacts, deps: { think: typeof think }): Promise<VoiceKit> {
  assertBrandContrast(brand);
  const first = parseVoice((await deps.think(request(brand))).value);
  const model = first !== null && voiceOk(first) ? first : await repair(brand, deps);
  const kit = shape(brand, model);
  if (brand.projectDir !== undefined && brand.projectDir.trim() !== "") {
    await recordDraftItems(brand.projectDir, itemsFrom(kit));
  }
  return kit;
}

async function repair(brand: BrandFacts, deps: { think: typeof think }): Promise<VoiceModel> {
  const second = parseVoice(
    (await deps.think(request(brand, "Three traits, this not that. No banned words in the traits."))).value,
  );
  if (second === null || !voiceOk(second)) throw new LiveShapeError("Voice kit failed the shaper.");
  return second;
}

function voiceOk(model: VoiceModel): boolean {
  try {
    for (const trait of model.traits) assertCleanProse("trait", trait.this);
    for (const word of model.use) assertCleanProse("vocabulary", word);
    for (const field of Object.values(model.microcopy)) assertCleanProse("microcopy", field);
    return model.traits.every((trait) => trait.not.trim() !== "");
  } catch {
    return false;
  }
}

function shape(brand: BrandFacts, model: VoiceModel): VoiceKit {
  const why = compileWhy(brand.answers);
  const positioning = positioningLine({
    visitor: latestValue(brand.answers, "DP-2.6"),
    offer: latestValue(brand.answers, "DP-2.7"),
    name: brand.name,
    siteWhy: why.siteWhy,
  });
  const doc = renderVoice({
    vibe: model.traits.map((trait) => trait.this).join(", "),
    antiVibe: model.traits.map((trait) => trait.not).join(", "),
    positioning,
    offer: latestValue(brand.answers, "DP-2.7"),
  });
  assertClaims(doc.markdown, evidenceFromAnswers([...brand.answers]));
  const traits = traitLines(doc.markdown);
  const microcopy = microcopyFrom(doc.markdown);
  return {
    markdown: doc.markdown,
    traits,
    vocabulary: { use: model.use, never: model.never },
    banned: [...BANNED_WORDS],
    microcopy,
    assumed: doc.assumed,
  };
}

function itemsFrom(kit: VoiceKit): ApprovalDraft[] {
  return [
    ...kit.traits.map((trait, index) => ({
      itemId: `voice:trait:${index + 1}`,
      kind: "trait",
      text: trait,
    })),
    { itemId: "voice:vocabulary:use", kind: "vocabulary", text: kit.vocabulary.use.join(", ") },
    { itemId: "voice:vocabulary:never", kind: "vocabulary", text: kit.vocabulary.never.join(", ") },
    { itemId: "voice:banned", kind: "banned", text: kit.banned.join(", ") },
    { itemId: "voice:microcopy:button", kind: "microcopy", text: kit.microcopy.button },
    { itemId: "voice:microcopy:error", kind: "microcopy", text: kit.microcopy.error },
    { itemId: "voice:microcopy:empty", kind: "microcopy", text: kit.microcopy.empty },
    { itemId: "voice:microcopy:not-found", kind: "microcopy", text: kit.microcopy.notFound },
  ];
}

function traitLines(markdown: string): [string, string, string] {
  const body = section(markdown, "Traits");
  const lines = body
    .split("\n")
    .map((line) => line.replace(/^- /, "").trim())
    .filter((line) => line.includes(", not "));
  const first = lines[0];
  const second = lines[1];
  const third = lines[2];
  if (first === undefined || second === undefined || third === undefined) {
    throw new LiveShapeError("Voice traits were not shaped.");
  }
  return [first, second, third];
}

function microcopyFrom(markdown: string): VoiceKit["microcopy"] {
  const body = section(markdown, "Microcopy");
  return {
    button: labeled(body, "button"),
    error: labeled(body, "error"),
    empty: labeled(body, "empty"),
    notFound: labeled(body, "notFound"),
  };
}

function labeled(body: string, label: string): string {
  for (const line of body.split("\n")) {
    const prefix = `- ${label}: `;
    if (line.startsWith(prefix)) return line.slice(prefix.length).trim();
  }
  throw new LiveShapeError(`Voice microcopy is missing ${label}.`);
}

function section(markdown: string, title: string): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${title}`);
  if (start < 0) throw new LiveShapeError(`Voice section ${title} is missing.`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n");
}

function request(brand: BrandFacts, repair?: string): ThinkRequest<VoiceModel> {
  const lines = [
    "Write the brand voice guide inputs.",
    'Three traits, each with this and not (for example direct, not rude).',
    "use is words we say. never is words we refuse, besides the standing banned list.",
    "microcopy covers button, error, empty, and notFound.",
    "Do not invent testimonials, awards, metrics, or client names.",
    "No exclamation marks. No em dashes.",
    `Brand: ${brand.name}`,
    answerLines(brand.answers),
  ];
  if (repair !== undefined) lines.push(repair);
  return { task: BRAND_VOICE_TASK, schema: VOICE_SCHEMA, input: lines.join("\n") };
}

function parseVoice(value: unknown): VoiceModel | null {
  if (!isRecord(value) || !Array.isArray(value.traits) || value.traits.length !== 3) return null;
  if (!Array.isArray(value.use) || !Array.isArray(value.never) || !isRecord(value.microcopy)) return null;
  try {
    const traits = value.traits.map((item, index) => {
      if (!isRecord(item)) throw new LiveShapeError(`traits.${index} must be an object.`);
      return {
        this: readString(item.this, `traits.${index}.this`),
        not: readString(item.not, `traits.${index}.not`),
      };
    });
    if (traits.some((trait) => trait.this === "" || trait.not === "")) return null;
    const use = value.use.map((item, index) => readString(item, `use.${index}`)).filter((item) => item !== "");
    const never = value.never.map((item, index) => readString(item, `never.${index}`)).filter((item) => item !== "");
    if (use.length === 0 || never.length === 0) return null;
    const micro = value.microcopy;
    const microcopy = {
      button: readString(micro.button, "microcopy.button"),
      error: readString(micro.error, "microcopy.error"),
      empty: readString(micro.empty, "microcopy.empty"),
      notFound: readString(micro.notFound, "microcopy.notFound"),
    };
    if (Object.values(microcopy).some((item) => item === "")) return null;
    const [a, b, c] = traits;
    if (a === undefined || b === undefined || c === undefined) return null;
    return { traits: [a, b, c], use, never, microcopy };
  } catch {
    return null;
  }
}
