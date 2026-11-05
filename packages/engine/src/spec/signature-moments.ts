/**
 * Signature moments (245v). One grok-cli think() call proposes three
 * candidates from the Brand idea, the picked direction, reference shots,
 * and signatureRecipeCandidates. The owner picks one or two. The pick is
 * written into DESIGN.md and covered by the design-lock hash.
 * 245k is not in the tree yet, so page prompts take signaturePromptBlock
 * from the current prompt writer.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { recipesFor, signatureRecipeCandidates, type RecipeName, type StyleWorld } from "@hitchhiker/design-system";
import { think, type ThinkDeps, type ThinkRequest, type ThinkResult } from "../ai/think.ts";
import type { JsonSchema } from "../ai/schema-validate.ts";
import { readDirectionDeal } from "../brand/directions.ts";
import { translateBrief } from "./art-direction.ts";
import { commitDesignMarkdown } from "./design-outputs.ts";
import { designLockMatches } from "./design-lock.ts";
import {
  isSignatureRecipeName,
  parseSignatureMoments,
  type ParsedSignatureMoment,
  type SignatureBudget,
} from "./design-md-lint.ts";
import { listReferenceImages } from "./reference-shots.ts";
import { SIGNATURE_RULE } from "./site-rules.ts";

export const SIGNATURE_TASK = "invent-signature-moments";
export const SIGNATURE_CANDIDATES_REL = ".hitchhiker/signature-candidates.json";
export const SIGNATURE_PICK_LOG_REL = ".hitchhiker/signature-pick.log";

export class SignatureMomentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignatureMomentError";
  }
}

export interface SignatureThink {
  (req: ThinkRequest<unknown>, deps?: ThinkDeps): Promise<ThinkResult<unknown>>;
}

export interface InventSignatureDeps {
  think?: SignatureThink;
}

interface StoredCandidates {
  world: StyleWorld;
  appetite: number;
  candidates: ParsedSignatureMoment[];
}

const SIGNATURE_SCHEMA: JsonSchema = {
  type: "object",
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        required: ["id", "name", "description", "section", "recipe", "approach", "fallback", "budget", "echoes"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          section: { type: "string" },
          recipe: { type: "string" },
          approach: { type: "string" },
          fallback: { type: "string" },
          budget: {
            type: "object",
            required: ["maxJsKb", "maxFrameMs", "lcp", "cls"],
            properties: {
              maxJsKb: { type: "number" },
              maxFrameMs: { type: "number" },
              lcp: { type: "number" },
              cls: { type: "number" },
            },
          },
          echoes: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

export function readSignatureMoments(projectDir: string): ParsedSignatureMoment[] {
  const file = path.join(projectDir, "DESIGN.md");
  if (!existsSync(file)) return [];
  try {
    return parseSignatureMoments(readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

export function readSignatureCandidates(projectDir: string): ParsedSignatureMoment[] {
  return readStored(projectDir)?.candidates ?? [];
}

/**
 * Proposes three moments. Refuses a recipe that is not in the style world's
 * map. Does not write DESIGN.md. The owner pick does that.
 */
export async function inventSignatureMoments(
  projectDir: string,
  deps: InventSignatureDeps = {},
): Promise<ParsedSignatureMoment[]> {
  if (designLockMatches(projectDir)) {
    throw new SignatureMomentError("DESIGN.md is locked. Re-approve the style guide before inventing signature moments.");
  }
  const designPath = path.join(projectDir, "DESIGN.md");
  if (!existsSync(designPath)) throw new SignatureMomentError("Write DESIGN.md before inventing signature moments.");
  const design = readFileSync(designPath, "utf8");
  const brand = sectionText(design, "Brand idea");
  if (brand.trim() === "") throw new SignatureMomentError("Write the Brand idea before inventing signature moments.");
  const deal = readDeal(projectDir);
  const picked = deal.directions.find((direction) => direction.id === deal.pickedId);
  if (picked === undefined) throw new SignatureMomentError("Pick a direction before inventing signature moments.");
  const brief = readOptional(path.join(projectDir, ".hitchhiker", "SITE-BRIEF.md"));
  const art = translateBrief(brief);
  const world = art.styleWorld;
  const appetite = art.motion.score;
  const allowed = signatureRecipeCandidates(world, appetite);
  const shots = listReferenceImages(projectDir).map((file) => file.replaceAll("\\", "/"));
  const input = [
    "Propose exactly 3 signature moment candidates for this site.",
    "Each candidate uses one recipe from the allowed list. Do not invent a recipe.",
    "Tie the description to the Brand idea in two or three sentences.",
    "",
    `Brand idea: ${brand.replace(/\s+/g, " ").trim()}`,
    `Direction: ${picked.name}. ${picked.description}`.trim(),
    `Style world: ${world}`,
    `Motion appetite: ${appetite}`,
    `Allowed recipes: ${allowed.join(", ")}`,
    shots.length === 0 ? "Reference shots: none" : `Reference shots: ${shots.join(", ")}`,
  ].join("\n");
  const run = deps.think ?? think;
  const result = await run(
    { task: SIGNATURE_TASK, schema: SIGNATURE_SCHEMA, input, effort: "high" },
    { projectDir },
  );
  const candidates = candidatesFrom(result.value, world, appetite);
  writeStored(projectDir, { world, appetite, candidates });
  return candidates;
}

/** Writes one or two picked candidates into DESIGN.md and logs the pick. */
export function pickSignatureMoments(projectDir: string, ids: readonly string[]): ParsedSignatureMoment[] {
  const unique = uniqueIds(ids);
  if (unique.length < 1 || unique.length > 2) {
    throw new SignatureMomentError("Pick one or two signature moments.");
  }
  const stored = readStored(projectDir);
  if (stored === null) throw new SignatureMomentError("Invent signature moments before picking.");
  const picked: ParsedSignatureMoment[] = [];
  for (const id of unique) {
    const found = stored.candidates.find((moment) => moment.id === id);
    if (found === undefined) throw new SignatureMomentError(`Unknown signature moment ${id}.`);
    assertRecipeAllowed(found.recipe, stored.world, stored.appetite);
    picked.push(found);
  }
  const designPath = path.join(projectDir, "DESIGN.md");
  if (!existsSync(designPath)) throw new SignatureMomentError("DESIGN.md is missing.");
  const next = replaceSignatureSection(readFileSync(designPath, "utf8"), renderSignatureBlocks(picked));
  commitDesignMarkdown(projectDir, next);
  const log = path.join(projectDir, SIGNATURE_PICK_LOG_REL);
  mkdirSync(path.dirname(log), { recursive: true });
  appendFileSync(log, `${new Date().toISOString()} picked ${picked.map((moment) => moment.id).join(", ")}\n`, "utf8");
  return picked;
}

/** Full contract for the hosting section. Every other prompt gets ids and echoes only. */
export function signaturePromptBlock(moments: readonly ParsedSignatureMoment[], sectionKey: string): string {
  if (moments.length === 0) return "";
  const ids = moments.map((moment) => moment.id);
  const hosted = moments.filter((moment) => sectionHostsMoment(sectionKey, moment.section));
  const lines = [
    "## Signature moments",
    "",
    SIGNATURE_RULE(ids),
    "Do not edit the Signature moments section in DESIGN.md.",
    "",
  ];
  if (hosted.length === 0) {
    const echoes = moments.flatMap((moment) => moment.echoes.map((echo) => `${moment.id}: ${echo}`));
    lines.push(`Ids: ${ids.join(", ")}. Echoes: ${echoes.length === 0 ? "none" : echoes.join("; ")}.`);
    lines.push("");
    return lines.join("\n");
  }
  const hosts = hosted.map((moment) => moment.section).filter((section, index, all) => all.indexOf(section) === index);
  lines.push(`Signature host: ${hosts.join(", ")}`);
  lines.push("");
  for (const moment of hosted) lines.push(renderSignatureBlocks([moment]), "");
  const others = moments.filter((moment) => !sectionHostsMoment(sectionKey, moment.section));
  if (others.length > 0) {
    const echoes = others.flatMap((moment) => moment.echoes.map((echo) => `${moment.id}: ${echo}`));
    lines.push(`Other ids: ${others.map((moment) => moment.id).join(", ")}. Echoes: ${echoes.length === 0 ? "none" : echoes.join("; ")}.`);
    lines.push("");
  }
  return lines.join("\n");
}

export function sectionHostsMoment(sectionKey: string, host: string): boolean {
  const key = sectionKey.trim().toLowerCase();
  const section = host.trim().toLowerCase();
  if (key === "" || section === "") return false;
  if (key === section) return true;
  if (section.endsWith(`/${key}`)) return true;
  if (key.endsWith(`/${section}`)) return true;
  return false;
}

/** Style-guide fragment. The desk lists locked moments and offers the pick. */
export function signatureDeskHtml(projectDir: string, token: string): string {
  const moments = readSignatureMoments(projectDir);
  const candidates = readSignatureCandidates(projectDir);
  const items = moments.length === 0
    ? "<li>None locked yet.</li>"
    : moments
      .map((moment) => {
        return `<li data-signature-id="${escapeHtml(moment.id)}">${escapeHtml(moment.name)} on ${escapeHtml(moment.section)} via ${escapeHtml(moment.recipe)}</li>`;
      })
      .join("");
  const form = moments.length > 0 || candidates.length === 0
    ? ""
    : `<form method="post" action="/approve" data-signature-pick>
      <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
      <input type="hidden" name="action" value="signature-pick" />
      ${candidates
        .map((moment) => {
          return `<label><input type="checkbox" name="moment" value="${escapeHtml(moment.id)}" /> ${escapeHtml(moment.name)} (${escapeHtml(moment.recipe)}, ${escapeHtml(moment.section)})</label>`;
        })
        .join("")}
      <button class="hh-btn hh-btn--secondary" type="submit">Lock signature moments</button>
    </form>`;
  const invent = moments.length === 0 && candidates.length === 0
    ? `<form method="post" action="/approve" data-signature-invent>
      <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
      <input type="hidden" name="action" value="signature-invent" />
      <button class="hh-btn hh-btn--secondary" type="submit">Propose signature moments</button>
    </form>`
    : "";
  return `<section data-signature-desk>
      <h3>Signature moments</h3>
      <ul data-signature-moments>${items}</ul>
      ${form}
      ${invent}
    </section>`;
}

export function renderSignatureBlocks(moments: readonly ParsedSignatureMoment[]): string {
  return moments.map((moment) => renderOne(moment)).join("\n\n");
}

function renderOne(moment: ParsedSignatureMoment): string {
  const budget = moment.budget;
  const budgetLine = budget === null
    ? "missing"
    : `maxJsKb ${trimNum(budget.maxJsKb)}, maxFrameMs ${trimNum(budget.maxFrameMs)}, lcp ${trimNum(budget.lcp)}s, cls ${trimNum(budget.cls)}`;
  const echoes = moment.echoes.length === 0 ? "none" : moment.echoes.join(", ");
  return [
    `### ${moment.id}`,
    "",
    `- id: ${moment.id}`,
    `- name: ${moment.name}`,
    `- description: ${moment.description}`,
    `- section: ${moment.section}`,
    `- recipe: ${moment.recipe}`,
    `- approach: ${moment.approach}`,
    `- fallback: ${moment.fallback}`,
    `- budget: ${budgetLine}`,
    `- echoes: ${echoes}`,
  ].join("\n");
}

function candidatesFrom(value: unknown, world: StyleWorld, appetite: number): ParsedSignatureMoment[] {
  const record = isRecord(value) ? value : null;
  const raw = record?.candidates;
  if (!Array.isArray(raw) || raw.length !== 3) {
    throw new SignatureMomentError("Signature invention must propose 3 candidates.");
  }
  const moments = raw.map((item) => momentFromModel(item, world, appetite));
  const ids = moments.map((moment) => moment.id);
  if (new Set(ids).size !== ids.length) throw new SignatureMomentError("Signature candidates must use different ids.");
  return moments;
}

function momentFromModel(value: unknown, world: StyleWorld, appetite: number): ParsedSignatureMoment {
  if (!isRecord(value)) throw new SignatureMomentError("A signature candidate was not an object.");
  const recipe = text(value.recipe);
  assertRecipeAllowed(recipe, world, appetite);
  const budget = budgetFrom(value.budget);
  if (budget === null) throw new SignatureMomentError(`Signature candidate ${text(value.id) || "without an id"} is missing a performance budget.`);
  const fallback = text(value.fallback);
  if (fallback === "") throw new SignatureMomentError(`Signature candidate ${text(value.id) || "without an id"} is missing a reduced-motion fallback.`);
  const description = text(value.description);
  const sentences = description.split(/(?<=[.])\s+/).filter((part) => part.trim() !== "");
  if (sentences.length < 2 || sentences.length > 3) {
    throw new SignatureMomentError(`Signature candidate ${text(value.id) || "without an id"} needs two or three sentences.`);
  }
  const echoes = Array.isArray(value.echoes) ? value.echoes.map((item) => text(item)).filter((item) => item !== "") : [];
  const moment: ParsedSignatureMoment = {
    id: slug(text(value.id)),
    name: text(value.name),
    description,
    section: text(value.section),
    recipe,
    approach: text(value.approach),
    fallback,
    echoes,
    budget,
  };
  if (moment.id === "" || moment.name === "" || moment.section === "" || moment.approach === "") {
    throw new SignatureMomentError("A signature candidate is missing an id, name, section, or approach.");
  }
  return moment;
}

function assertRecipeAllowed(recipe: string, world: StyleWorld, appetite: number): void {
  if (!isSignatureRecipeName(recipe) || !recipeInWorld(world, appetite, recipe)) {
    throw new SignatureMomentError(`Recipe ${recipe || "unnamed"} is outside the ${world} style world map.`);
  }
}

function recipeInWorld(world: StyleWorld, appetite: number, recipe: string): recipe is RecipeName {
  return recipesFor({ world, appetite }).some((entry) => entry.recipe === recipe);
}

function budgetFrom(value: unknown): SignatureBudget | null {
  if (!isRecord(value)) return null;
  const maxJsKb = number(value.maxJsKb);
  const maxFrameMs = number(value.maxFrameMs);
  const lcp = number(value.lcp);
  const cls = number(value.cls);
  if (maxJsKb === null || maxFrameMs === null || lcp === null || cls === null) return null;
  return { maxJsKb, maxFrameMs, lcp, cls };
}

function replaceSignatureSection(markdown: string, body: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => line.trim() === "## Signature moments");
  const block = ["## Signature moments", "", body.trim(), ""];
  if (start < 0) {
    const image = lines.findIndex((line) => line.trim() === "## Image direction");
    let insert = lines.length;
    if (image >= 0) {
      insert = lines.length;
      for (let index = image + 1; index < lines.length; index += 1) {
        if ((lines[index] ?? "").startsWith("## ")) {
          insert = index;
          break;
        }
      }
    }
    lines.splice(insert, 0, ...block);
    return lines.join("\n");
  }
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if ((lines[index] ?? "").startsWith("## ")) {
      end = index;
      break;
    }
  }
  lines.splice(start, end - start, ...block);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

function readStored(projectDir: string): StoredCandidates | null {
  const file = path.join(projectDir, SIGNATURE_CANDIDATES_REL);
  if (!existsSync(file)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!isRecord(parsed) || !Array.isArray(parsed.candidates)) return null;
    const world = parsed.world;
    const appetite = number(parsed.appetite);
    if (!isWorld(world) || appetite === null) return null;
    const candidates = parsed.candidates.filter(isMoment);
    return { world, appetite, candidates };
  } catch {
    return null;
  }
}

function writeStored(projectDir: string, stored: StoredCandidates): void {
  const file = path.join(projectDir, SIGNATURE_CANDIDATES_REL);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
}

function readDeal(projectDir: string): { directions: { id: string; name: string; description: string }[]; pickedId: string } {
  let deal: ReturnType<typeof readDirectionDeal>;
  try {
    deal = readDirectionDeal(projectDir);
  } catch {
    deal = null;
  }
  if (deal === null || deal.pickedId === null) {
    throw new SignatureMomentError("Pick a direction before inventing signature moments.");
  }
  return { directions: deal.directions.map((direction) => ({
    id: direction.id,
    name: direction.name,
    description: direction.description,
  })), pickedId: deal.pickedId };
}

function sectionText(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.trim().toLowerCase() === `## ${heading.toLowerCase()}`);
  if (start < 0) return "";
  const rest: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if ((lines[index] ?? "").startsWith("## ")) break;
    rest.push(lines[index] ?? "");
  }
  return rest.join("\n").trim();
}

function uniqueIds(ids: readonly string[]): string[] {
  const found: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (trimmed === "" || found.includes(trimmed)) continue;
    found.push(trimmed);
  }
  return found;
}

function isMoment(value: unknown): value is ParsedSignatureMoment {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && typeof value.recipe === "string" && typeof value.section === "string";
}

function isWorld(value: unknown): value is StyleWorld {
  return value === "editorial" || value === "3d-world" || value === "playful" || value === "brutalist";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function slug(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned;
}

function trimNum(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function readOptional(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}
