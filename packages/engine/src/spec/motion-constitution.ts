/**
 * Motion constitution (245w). Named easings and duration bands come from the
 * style-world tokens, tightened by appetite. Calm keeps fewer, softer easings.
 * Kinetic may sharpen the reveal to power3.out. At most three easings and two
 * duration bands. Stagger stays a delay, not a band.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { recipesFor, worldSetFor, type StyleWorld } from "@hitchhiker/design-system";

export const MOTION_TOKENS_PATH = "src/styles/motion-tokens.ts";
export const MOTION_CONSTITUTION_HEADING = "Motion constitution";

export const TICKER_RULES = [
  "new Lenis({ autoRaf: false })",
  "lenis.on('scroll', ScrollTrigger.update)",
  "gsap.ticker.add(t => lenis.raf(t * 1000))",
  "gsap.ticker.lagSmoothing(0)",
] as const;

export type MotionAppetite = "calm" | "measured" | "kinetic";

export interface NamedEase {
  name: string;
  value: string;
}

export interface DurationBand {
  name: string;
  min: number;
  max: number;
}

export interface MotionConstitution {
  world: StyleWorld;
  appetite: MotionAppetite;
  easings: readonly NamedEase[];
  bands: readonly DurationBand[];
  scrollOwner: string;
  ticker: readonly string[];
  recipes: readonly string[];
}

export interface MotionChange {
  ease?: string;
  duration?: number;
  recipe?: string;
  scrollOwner?: string;
  text?: string;
}

const EASE_WORD =
  /\b(power[1-4](?:\.(?:out|inOut|in))?|expo(?:\.(?:out|inOut|in))?|circ(?:\.(?:out|inOut|in))?|sine(?:\.(?:out|inOut|in))?|back(?:\.(?:out|inOut|in))?(?:\([^)]*\))?|bounce(?:\.(?:out|inOut|in))?|elastic(?:\.(?:out|inOut|in))?(?:\([^)]*\))?|steps\([^)]*\)|none|linear)\b/g;

export function appetiteOf(score: number, text = ""): MotionAppetite {
  const calmWord = /\b(calm|quiet|still|soft|gentle)\b/i.test(text);
  const kineticWord = /\b(kinetic|sharp|snappy|punchy)\b/i.test(text);
  if (calmWord || score <= 3) return "calm";
  if (kineticWord || score >= 7) return "kinetic";
  return "measured";
}

export function deriveMotionConstitution(input: {
  world: StyleWorld;
  score: number;
  text?: string;
}): MotionConstitution {
  const set = worldSetFor(input.world);
  const appetite = appetiteOf(input.score, input.text ?? "");
  const recipes = recipesFor({ world: input.world, appetite: input.score }).map((item) => item.recipe);
  return {
    world: input.world,
    appetite,
    easings: namedEasings(set.easings.reveal, set.easings.hover, set.easings.track, appetite),
    bands: fitBands(seconds(set.durations.reveal), seconds(set.durations.hover), appetite),
    scrollOwner: "lenis",
    ticker: [...TICKER_RULES],
    recipes,
  };
}

export function renderMotionConstitution(constitution: MotionConstitution): string {
  const easings = constitution.easings.map((ease) => `${ease.name}: ${ease.value}`).join(", ");
  const bands = constitution.bands.map((band) => `${band.name} ${trimNum(band.min)}-${trimNum(band.max)}s`).join(", ");
  const recipes = constitution.recipes.length === 0 ? "none" : constitution.recipes.join(", ");
  return [
    `## ${MOTION_CONSTITUTION_HEADING}`,
    "",
    "Scroll owner: Lenis via motionSetup. One ticker only.",
    ...constitution.ticker.map((line) => `- ${line}`),
    "",
    `Easings: ${easings}.`,
    `Duration bands: ${bands}.`,
    `Recipes: ${recipes}.`,
    "Stagger is a delay, not a duration band.",
    "",
  ].join("\n");
}

export function parseMotionConstitution(markdown: string): MotionConstitution | null {
  const body = constitutionBody(markdown);
  if (body === null) return null;
  const easings = parseEasings(body);
  const bands = parseBands(body);
  if (easings.length === 0 && bands.length === 0) return null;
  const recipeLine = /^Recipes:\s*(.+)$/m.exec(body);
  const recipes = (recipeLine?.[1] ?? "")
    .replace(/\.\s*$/, "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "" && part.toLowerCase() !== "none");
  const owner = /lenis/i.test(body) ? "lenis" : "other";
  return {
    world: "editorial",
    appetite: "measured",
    easings,
    bands,
    scrollOwner: owner,
    ticker: [...TICKER_RULES],
    recipes,
  };
}

export function renderMotionTokensModule(constitution: MotionConstitution): string {
  const easeEntries = constitution.easings
    .map((ease) => `  ${JSON.stringify(ease.name)}: ${JSON.stringify(ease.value)},`)
    .join("\n");
  const bandEntries = constitution.bands
    .map((band) => `  ${JSON.stringify(band.name)}: { min: ${trimNum(band.min)}, max: ${trimNum(band.max)} },`)
    .join("\n");
  const recipeEntries = constitution.recipes.map((name) => `  ${JSON.stringify(name)},`).join("\n");
  return [
    "/** Motion constitution. Recipes accept these ease names, values, and duration bands. */",
    "export const motionEasings = {",
    easeEntries,
    "} as const;",
    "",
    "export const motionDurationBands = {",
    bandEntries,
    "} as const;",
    "",
    'export const motionScrollOwner = "lenis" as const;',
    "",
    "export const motionRecipes = [",
    recipeEntries,
    "] as const;",
    "",
  ].join("\n");
}

/** Writes src/styles/motion-tokens.ts when DESIGN.md has a motion constitution. */
export function writeMotionTokens(projectDir: string, markdown: string): string | null {
  const constitution = parseMotionConstitution(markdown);
  if (constitution === null) return null;
  const file = path.join(projectDir, MOTION_TOKENS_PATH);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, renderMotionTokensModule(constitution), "utf8");
  return file;
}

/**
 * Elevate may change motion only inside the constitution.
 * A missing constitution allows the change so older projects stay as they are.
 */
export function withinConstitution(change: MotionChange | string, constitution: MotionConstitution | null): boolean {
  if (constitution === null) return true;
  const text = typeof change === "string" ? change : (change.text ?? "");
  const ease = typeof change === "string" ? undefined : change.ease;
  const duration = typeof change === "string" ? undefined : change.duration;
  const recipe = typeof change === "string" ? undefined : change.recipe;
  const owner = typeof change === "string" ? undefined : change.scrollOwner;
  const allowed = allowedEases(constitution);
  if (ease !== undefined && !allowed.has(ease)) return false;
  if (duration !== undefined && !durationAllowed(duration, constitution.bands)) return false;
  if (recipe !== undefined && constitution.recipes.length > 0 && !constitution.recipes.includes(recipe)) return false;
  if (owner !== undefined && owner !== "lenis" && owner !== "motionSetup") return false;
  for (const token of easeTokens(text)) {
    if (!allowed.has(token)) return false;
  }
  for (const secondsValue of secondTokens(text)) {
    if (!durationAllowed(secondsValue, constitution.bands)) return false;
  }
  return true;
}

export function durationAllowed(secondsValue: number, bands: readonly DurationBand[]): boolean {
  if (secondsValue === 0) return true;
  return bands.some((band) => secondsValue >= band.min && secondsValue <= band.max);
}

export function allowedEases(constitution: MotionConstitution): Set<string> {
  const allowed = new Set<string>();
  for (const ease of constitution.easings) {
    allowed.add(ease.value);
    allowed.add(ease.name);
  }
  return allowed;
}

function namedEasings(reveal: string, hover: string, track: string, appetite: MotionAppetite): NamedEase[] {
  let revealEase = reveal;
  if (appetite === "kinetic" && revealEase !== "none" && sharpness(revealEase) < 4) revealEase = "power3.out";
  if (appetite === "calm" && sharpness(revealEase) >= 5) revealEase = "power2.out";
  const trackEase = track === "" ? "none" : track;
  if (appetite === "calm") {
    const softer = hover !== "none" && sharpness(hover) < sharpness(revealEase) ? hover : revealEase;
    if (softer === "none") return [{ name: "brand-track", value: trackEase }];
    const rows: NamedEase[] = [{ name: "brand-out", value: softer }];
    if (trackEase !== softer) rows.push({ name: "brand-track", value: trackEase });
    return rows.slice(0, 3);
  }
  return uniqueByValue([
    { name: "brand-out", value: revealEase },
    { name: "brand-hover", value: hover },
    { name: "brand-track", value: trackEase },
  ]).slice(0, 3);
}

function fitBands(reveal: number, hover: number, appetite: MotionAppetite): DurationBand[] {
  let microMin = 0.2;
  let microMax = 0.35;
  let storyMin = 0.8;
  let storyMax = appetite === "calm" ? 1.1 : 1.4;
  const consider = (value: number): void => {
    if (appetite === "calm") return;
    if ((value >= microMin && value <= microMax) || (value >= storyMin && value <= storyMax)) return;
    const microDist = Math.min(Math.abs(value - microMin), Math.abs(value - microMax));
    const storyDist = Math.min(Math.abs(value - storyMin), Math.abs(value - storyMax));
    if (microDist <= storyDist) {
      if (value < microMin) microMin = value;
      if (value > microMax) microMax = value;
      return;
    }
    if (value < storyMin) storyMin = value;
    if (value > storyMax) storyMax = value;
  };
  consider(hover);
  consider(reveal);
  const bands: DurationBand[] = [{ name: "micro", min: round2(microMin), max: round2(microMax) }];
  if (reveal >= 0.5 || hover >= 0.5) {
    bands.push({ name: "story", min: round2(storyMin), max: round2(storyMax) });
  }
  return bands.slice(0, 2);
}

function uniqueByValue(rows: readonly NamedEase[]): NamedEase[] {
  const out: NamedEase[] = [];
  for (const row of rows) {
    if (out.some((item) => item.value === row.value)) continue;
    out.push(row);
  }
  return out;
}

function sharpness(value: string): number {
  const name = value.toLowerCase();
  if (name === "none" || name === "linear") return 0;
  if (name.startsWith("power1") || name.startsWith("sine")) return 1;
  if (name.startsWith("power2") || name.startsWith("circ")) return 2;
  if (name.startsWith("expo")) return 3;
  if (name.startsWith("power3")) return 4;
  if (name.startsWith("power4") || name.startsWith("back")) return 5;
  return 6;
}

function seconds(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function trimNum(value: number): string {
  return String(round2(value));
}

/**
 * Motion constitution is an extra heading, not one of the canonical
 * DESIGN.md sections, so the canon reader returns null for it.
 */
function constitutionBody(markdown: string): string | null {
  const lines = markdown.split("\n");
  const target = MOTION_CONSTITUTION_HEADING.toLowerCase();
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^##\s+(.+?)\s*$/.exec(lines[index] ?? "");
    if (match?.[1]?.toLowerCase() === target) {
      start = index + 1;
      break;
    }
  }
  if (start < 0) return null;
  const rest: string[] = [];
  for (let index = start; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index] ?? "")) break;
    rest.push(lines[index] ?? "");
  }
  const body = rest.join("\n").trim();
  return body === "" ? null : body;
}

function parseEasings(body: string): NamedEase[] {
  const line = /^Easings:\s*(.+)$/m.exec(body);
  if (line?.[1] === undefined) return [];
  const easings: NamedEase[] = [];
  for (const part of line[1].replace(/\.\s*$/, "").split(",")) {
    const splitAt = part.indexOf(":");
    if (splitAt <= 0) continue;
    const name = part.slice(0, splitAt).trim();
    const value = part.slice(splitAt + 1).trim();
    if (name === "" || value === "") continue;
    easings.push({ name, value });
  }
  return easings;
}

function parseBands(body: string): DurationBand[] {
  const line = /^Duration bands:\s*(.+)$/m.exec(body);
  if (line?.[1] === undefined) return [];
  const bands: DurationBand[] = [];
  for (const match of line[1].matchAll(/([A-Za-z][A-Za-z0-9-]*)\s+([\d.]+)\s*-\s*([\d.]+)\s*s/g)) {
    const name = match[1];
    const min = Number(match[2]);
    const max = Number(match[3]);
    if (name === undefined || !Number.isFinite(min) || !Number.isFinite(max)) continue;
    bands.push({ name, min, max });
  }
  return bands;
}

function easeTokens(text: string): string[] {
  const hits: string[] = [];
  for (const match of text.matchAll(EASE_WORD)) {
    const token = match[1];
    if (token !== undefined) hits.push(token);
  }
  return hits;
}

function secondTokens(text: string): number[] {
  const hits: number[] = [];
  for (const match of text.matchAll(/\b(\d+(?:\.\d+)?)\s*s\b/g)) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) hits.push(value);
  }
  return hits;
}
