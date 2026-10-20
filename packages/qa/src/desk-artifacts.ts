/**
 * On-disk artifacts the review runner and Elevate read.
 * A missing file means the build has not measured that row yet.
 * A file that is not JSON fails closed. Font licences are not read here.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { DefectRecord } from "./defect-log.ts";
import type { ImagerySample } from "./imagery-grade.ts";
import type { JurorSample } from "./juror-floor.ts";
import type { RedesignStepShot } from "./redesign-order.ts";
import type { ApprovedDirection, SectionVariant, VariantPick } from "./variants.ts";

export interface ScopeArtifact {
  target: string;
  lock: readonly string[];
}

export interface LockShot {
  id: string;
  png: Buffer;
}

export interface RedesignArtifact {
  namedFamilies: string[];
  steps: RedesignStepShot[];
}

export interface VariantArtifact {
  approved: ApprovedDirection;
  variants: SectionVariant[];
  picks: VariantPick[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson(file: string): unknown | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as unknown;
  } catch {
    throw new Error(`${path.basename(file)} is not valid JSON.`);
  }
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} is missing.`);
  }
  return value;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} is missing.`);
  return value;
}

function asBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} is missing.`);
  return value;
}

export function imageryFile(root: string): string {
  return path.join(root, ".hitchhiker", "review", "imagery.json");
}

export function creditsFile(root: string): string {
  return path.join(root, "CREDITS.json");
}

export function jurorFile(root: string): string {
  return path.join(root, ".hitchhiker", "review", "juror.json");
}

export function defectsFile(root: string): string {
  return path.join(root, ".hitchhiker", "defects.json");
}

export function redesignFile(root: string): string {
  return path.join(root, ".hitchhiker", "redesign", "order.json");
}

export function variantsFile(root: string): string {
  return path.join(root, ".hitchhiker", "variants", "combine.json");
}

export function combinedVariantsFile(root: string): string {
  return path.join(root, ".hitchhiker", "variants", "combined.json");
}

export function sectionScopeFile(root: string): string {
  return path.join(root, ".hitchhiker", "elevate", "scope.json");
}

export function readImageryFile(root: string): ImagerySample[] | null {
  const value = readJson(imageryFile(root));
  if (value === null) return null;
  if (!Array.isArray(value)) throw new Error("imagery.json needs an array.");
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`imagery.json row ${index + 1} is not an object.`);
    return {
      src: asString(item.src, "imagery src"),
      temperature: asNumber(item.temperature, "temperature"),
      contrast: asNumber(item.contrast, "contrast"),
      saturation: asNumber(item.saturation, "saturation"),
    };
  });
}

export function readCreditsFile(root: string): unknown | null {
  return readJson(creditsFile(root));
}

export function readJurorFile(root: string): JurorSample | null {
  const value = readJson(jurorFile(root));
  if (value === null) return null;
  if (!isRecord(value)) throw new Error("juror.json needs an object.");
  const controls = value.controls;
  const textPx = value.textPx;
  const videos = value.videos;
  const headings = value.headings;
  if (!Array.isArray(controls) || !Array.isArray(textPx) || !Array.isArray(videos) || !Array.isArray(headings)) {
    throw new Error("juror.json is missing a measurement list.");
  }
  return {
    scrollWidth: asNumber(value.scrollWidth, "scrollWidth"),
    clientWidth: asNumber(value.clientWidth, "clientWidth"),
    controls: controls.map((item) => {
      if (!isRecord(item)) throw new Error("juror.json has a control that is not an object.");
      return { width: asNumber(item.width, "control width"), height: asNumber(item.height, "control height") };
    }),
    keyboardTrap: asBoolean(value.keyboardTrap, "keyboardTrap"),
    missingFocus: asBoolean(value.missingFocus, "missingFocus"),
    textPx: textPx.map((item) => asNumber(item, "textPx")),
    contrastRatio: asNumber(value.contrastRatio, "contrastRatio"),
    hoverOnlyControls: asNumber(value.hoverOnlyControls, "hoverOnlyControls"),
    videos: videos.map((item) => {
      if (!isRecord(item)) throw new Error("juror.json has a video that is not an object.");
      return { autoplay: asBoolean(item.autoplay, "autoplay"), muted: asBoolean(item.muted, "muted") };
    }),
    reducedMotionHidesContent: asBoolean(value.reducedMotionHidesContent, "reducedMotionHidesContent"),
    headings: headings.map((item) => asString(item, "heading")),
    fakeTestimonials: asBoolean(value.fakeTestimonials, "fakeTestimonials"),
  };
}

export function readDefectsFile(root: string): DefectRecord[] | null {
  const value = readJson(defectsFile(root));
  if (value === null) return null;
  if (!Array.isArray(value)) throw new Error("defects.json needs an array.");
  return value.map((item) => {
    if (!isRecord(item)) throw new Error("defects.json has a row that is not an object.");
    const severity = item.severity;
    const state = item.state;
    if (severity !== "blocker" && severity !== "major" && severity !== "minor") {
      throw new Error("defects.json has a row with no severity.");
    }
    if (state !== "open" && state !== "closed") throw new Error("defects.json has a row with no state.");
    let retest: DefectRecord["retest"] = null;
    if (item.retest !== null && item.retest !== undefined) {
      if (!isRecord(item.retest)) throw new Error("defects.json has a retest that is not an object.");
      const result = item.retest.result;
      if (result !== "pass" && result !== "fail") throw new Error("defects.json has a retest with no result.");
      retest = { elevatePass: asString(item.retest.elevatePass, "elevatePass"), result };
    }
    return {
      id: asString(item.id, "defect id"),
      severity,
      project: asString(item.project, "defect project"),
      state,
      retest,
    };
  });
}

function bufferFrom(value: unknown, label: string): Buffer {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} screenshot is missing.`);
  return Buffer.from(value, "base64");
}

export function readRedesignFile(root: string): RedesignArtifact | null {
  const value = readJson(redesignFile(root));
  if (value === null) return null;
  if (!isRecord(value) || !Array.isArray(value.steps) || !Array.isArray(value.namedFamilies)) {
    throw new Error("order.json needs namedFamilies and steps.");
  }
  const namedFamilies = value.namedFamilies.map((item) => asString(item, "named family"));
  const steps = value.steps.map((item) => {
    if (!isRecord(item)) throw new Error("order.json has a step that is not an object.");
    return {
      step: asString(item.step, "step"),
      displayFamily: asString(item.displayFamily, "displayFamily"),
      before: bufferFrom(item.before, "before"),
      after: bufferFrom(item.after, "after"),
    };
  });
  return { namedFamilies, steps };
}

function regionMap(value: unknown, label: string): Record<string, string> {
  if (!isRecord(value)) throw new Error(`${label} regions are missing.`);
  const regions: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") throw new Error(`${label} region ${key} is not text.`);
    regions[key] = item;
  }
  return regions;
}

export function readVariantsFile(root: string): VariantArtifact | null {
  const value = readJson(variantsFile(root));
  if (value === null) return null;
  if (!isRecord(value) || !isRecord(value.approved) || !Array.isArray(value.variants) || !Array.isArray(value.picks)) {
    throw new Error("combine.json needs approved, variants, and picks.");
  }
  const approved = value.approved;
  const variants = value.variants.map((item) => {
    if (!isRecord(item)) throw new Error("combine.json has a variant that is not an object.");
    return {
      id: asString(item.id, "variant id"),
      sectionId: asString(item.sectionId, "variant section"),
      regions: regionMap(item.regions, "variant"),
    };
  });
  const picks = value.picks.map((item) => {
    if (!isRecord(item)) throw new Error("combine.json has a pick that is not an object.");
    return { region: asString(item.region, "pick region"), variantId: asString(item.variantId, "pick variant") };
  });
  return {
    approved: {
      id: asString(approved.id, "approved id"),
      sectionId: asString(approved.sectionId, "approved section"),
      regions: regionMap(approved.regions, "approved"),
    },
    variants,
    picks,
  };
}

export function readSectionScope(root: string): ScopeArtifact | null {
  const value = readJson(sectionScopeFile(root));
  if (value === null) return null;
  if (!isRecord(value) || !Array.isArray(value.lock)) throw new Error("scope.json needs a target and a lock list.");
  return {
    target: asString(value.target, "target"),
    lock: value.lock.map((item) => asString(item, "lock")),
  };
}

export function readLockShots(root: string, scope: { lock: readonly string[] }): LockShot[] {
  const shots: LockShot[] = [];
  for (const id of scope.lock) {
    const file = path.join(root, ".hitchhiker", "elevate", "locks", `${id}.png`);
    if (!existsSync(file)) continue;
    shots.push({ id, png: readFileSync(file) });
  }
  return shots;
}
