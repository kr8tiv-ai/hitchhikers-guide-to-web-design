/**
 * Elevate planner (prompt 128, v2 §12, v1 §12.2).
 *
 * One round is a plan of at most eight upgrades. Notes are `file: change`.
 * The first colon splits the pair. A Windows drive (`C:\src\hero.tsx: change`)
 * keeps the drive colon and splits on the next one. Later colons stay in the
 * change. Pillar FIX rows are the intended notes. A note with no colon, an
 * empty file, or an empty change does not name a file and is counted in
 * `skipped`.
 *
 * A `..` path segment is skipped. `src/foo..bar.ts` has no such segment and
 * stays. Duplicate file and change pairs are dropped and are not counted in
 * `skipped`. Items stay in input order. More than eight accepted candidates
 * keeps the first eight and sets `truncated`. Empty input is an empty list
 * and `truncated: false`.
 *
 * A change is skipped, and the rest of the plan is kept, when it has an
 * exclamation mark or the site anti-slop lint hits (banned words, including
 * the standalone word elevate, banned phrases, an em dash, lorem). The file
 * path may contain elevate. `elevated` is not that word. `add a magnetic`,
 * and any other use of the word magnetic, is skipped. `non-magnetic` is not
 * a magnetic control and stays.
 *
 * Nothing here writes a file or applies an edit. `planElevateModel` is the
 * model path: `think({ task: "elevate-plan", schema, effort: "xhigh" })`,
 * then `planElevate`. The live call is prompt 131.
 */

import path from "node:path";
import { validateJson, type JsonSchema, type ThinkRequest, type think } from "@hitchhiker/engine";
import { lintSlop } from "./antislop.ts";
import { REVIEW_WIDTHS } from "./screenshots.ts";

export const ELEVATE_CAP = 8;

export const ELEVATE_PLAN_TASK = "elevate-plan";

const PASSES = ["type-and-spacing", "motion", "imagery", "copy", "standout"] as const;

const FEATURES = [
  "hero-interaction",
  "scroll-storytelling",
  "cursor",
  "3d-moment",
  "micro-interactions",
  "sound-toggle",
  "transitions",
  "easter-egg",
] as const;

type ElevatePass = (typeof PASSES)[number];
type ElevateFeature = (typeof FEATURES)[number];

const PASS_LABEL: Record<ElevatePass, string> = {
  "type-and-spacing": "type and spacing",
  motion: "motion",
  imagery: "imagery",
  copy: "copy",
  standout: "standout",
};

const FEATURE_LABEL: Record<ElevateFeature, string> = {
  "hero-interaction": "hero interaction",
  "scroll-storytelling": "scroll storytelling",
  cursor: "cursor",
  "3d-moment": "3d moment",
  "micro-interactions": "micro-interactions",
  "sound-toggle": "sound toggle",
  transitions: "transitions",
  "easter-egg": "easter egg",
};

export const ELEVATE_PLAN_SCHEMA: JsonSchema = {
  type: "object",
  required: ["upgrades"],
  properties: {
    upgrades: {
      type: "array",
      maxItems: ELEVATE_CAP,
      items: {
        type: "object",
        required: ["file", "change", "pass", "phone", "reducedMotion"],
        properties: {
          file: { type: "string", maxLength: 240 },
          change: { type: "string", maxLength: 400 },
          pass: { type: "string", enum: PASSES },
          feature: { type: "string", enum: FEATURES },
          phone: { type: "string", maxLength: 120 },
          reducedMotion: { type: "string", maxLength: 200 },
        },
      },
    },
  },
};

export interface ElevateItem {
  file: string;
  change: string;
}

export interface ElevatePlan {
  items: ElevateItem[];
  skipped: number;
  truncated: boolean;
}

/** Cold read. `shots` is one path per review width, in REVIEW_WIDTHS order. */
export interface ElevateColdRead {
  shots: readonly string[];
  code: string;
  brand: string;
  voice: string;
  motion: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPass(value: string): value is ElevatePass {
  return (PASSES as readonly string[]).includes(value);
}

function isFeature(value: string): value is ElevateFeature {
  return (FEATURES as readonly string[]).includes(value);
}

function hasParentSegment(file: string): boolean {
  const raw = file.split(/[/\\]/);
  if (raw.some((segment) => segment === "..")) return true;
  return path.normalize(file).split(/[/\\]/).some((segment) => segment === "..");
}

/**
 * Split `file: change`. A leading drive letter is not the separator.
 * Returns undefined when the note does not name both a file and a change.
 */
function splitNote(note: string): ElevateItem | undefined {
  const trimmed = note.trim();
  if (trimmed.length === 0) return undefined;
  let index = trimmed.indexOf(":");
  if (index < 0) return undefined;
  if (/^[A-Za-z]:[\\/]/.test(trimmed)) {
    index = trimmed.indexOf(":", index + 1);
    if (index < 0) return undefined;
  }
  const file = trimmed.slice(0, index).trim();
  const change = trimmed.slice(index + 1).trim();
  if (file.length === 0 || change.length === 0) return undefined;
  return { file, change };
}

function isMagnetic(change: string): boolean {
  const folded = change.replace(/\u2019/g, "'").replace(/\s+/g, " ").toLowerCase();
  if (folded.includes("add a magnetic")) return true;
  const withoutException = folded.replaceAll("non-magnetic", "");
  return /\bmagnetic\b/.test(withoutException);
}

function changeRejected(change: string): boolean {
  if (isMagnetic(change)) return true;
  return lintSlop(change, "site").length > 0;
}

export function planElevate(notes: string[]): ElevatePlan {
  const items: ElevateItem[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let accepted = 0;

  for (const note of notes) {
    if (typeof note !== "string") {
      skipped += 1;
      continue;
    }
    const parsed = splitNote(note);
    if (parsed === undefined || hasParentSegment(parsed.file) || changeRejected(parsed.change)) {
      skipped += 1;
      continue;
    }
    const key = `${parsed.file}\0${parsed.change}`;
    if (seen.has(key)) continue;
    seen.add(key);
    accepted += 1;
    if (items.length < ELEVATE_CAP) items.push(parsed);
  }

  return { items, skipped, truncated: accepted > ELEVATE_CAP };
}

function coldReadInput(read: ElevateColdRead): string {
  const widths = REVIEW_WIDTHS.join(", ");
  return [
    "How could I possibly improve this?",
    "Rank at most eight upgrades by impact versus effort. Return them best first.",
    "Tag each by pass: type and spacing, motion, imagery, or copy.",
    "Or tag a standout feature: hero interaction, scroll storytelling, cursor (not magnetic), 3d moment, micro-interactions, sound toggle, transitions, or easter egg.",
    "Each upgrade needs a phone weight and a reduced-motion version.",
    "Name a file in the repo. Do not use an exclamation mark. Do not plan a magnetic control. Do not use a banned voice word.",
    `Screenshots are attached in width order: ${widths}.`,
    "",
    "BRAND",
    read.brand,
    "",
    "VOICE",
    read.voice,
    "",
    "MOTION",
    read.motion,
    "",
    "CODE",
    read.code,
  ].join("\n");
}

function assertColdRead(read: ElevateColdRead): void {
  if (!isRecord(read) || !Array.isArray(read.shots)) {
    throw new Error("elevate cold read needs shots, code, brand, voice, and motion.");
  }
  if (read.shots.length !== REVIEW_WIDTHS.length) {
    throw new Error(
      `elevate cold read needs ${REVIEW_WIDTHS.length} shots, one per width ${REVIEW_WIDTHS.join(", ")}.`,
    );
  }
  for (const shot of read.shots) {
    if (typeof shot !== "string" || shot.trim().length === 0) {
      throw new Error("elevate cold read shots must be file paths.");
    }
  }
  const fields = ["code", "brand", "voice", "motion"] as const;
  for (const field of fields) {
    if (typeof read[field] !== "string") {
      throw new Error(`elevate cold read ${field} must be text.`);
    }
  }
}

function noteFromUpgrade(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.file !== "string" || typeof value.change !== "string") return undefined;
  if (typeof value.pass !== "string" || !isPass(value.pass)) return undefined;
  if (typeof value.phone !== "string" || typeof value.reducedMotion !== "string") return undefined;
  const file = value.file.trim();
  const change = value.change.trim();
  const phone = value.phone.trim();
  const reduced = value.reducedMotion.trim();
  if (file.length === 0 || change.length === 0 || phone.length === 0 || reduced.length === 0) {
    return undefined;
  }
  let featureLabel = "";
  if (value.feature !== undefined) {
    if (typeof value.feature !== "string" || !isFeature(value.feature)) return undefined;
    featureLabel = ` ${FEATURE_LABEL[value.feature]}`;
  }
  return `${file}: ${change} Pass ${PASS_LABEL[value.pass]}${featureLabel}. Phone ${phone}. Reduced motion ${reduced}.`;
}

function notesFromModel(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.upgrades)) {
    throw new Error("elevate-plan schema failed: upgrades is missing.");
  }
  const notes: string[] = [];
  for (const item of value.upgrades) {
    notes.push(noteFromUpgrade(item) ?? "");
  }
  return notes;
}

/**
 * Cold read through the 011 adapter. Does not write a site file and does not
 * apply an edit. The adapter may log the call. Prompt 131 runs this live.
 */
export async function planElevateModel(
  read: ElevateColdRead,
  deps: { think: typeof think },
): Promise<ElevatePlan> {
  assertColdRead(read);
  const request: ThinkRequest<unknown> = {
    task: ELEVATE_PLAN_TASK,
    schema: ELEVATE_PLAN_SCHEMA,
    effort: "xhigh",
    input: coldReadInput(read),
    images: read.shots,
  };
  const result = await deps.think(request);
  const errors = validateJson(result.value, ELEVATE_PLAN_SCHEMA);
  if (errors.length > 0) {
    throw new Error(`elevate-plan schema failed: ${errors.join("; ")}`);
  }
  return planElevate(notesFromModel(result.value));
}
