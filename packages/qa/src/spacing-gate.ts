/**
 * Spacing gate (spec 243, G5).
 *
 * Measured margins, paddings, and gaps come from an injected runner.
 * This module does not open a browser. A length is off the scale when it
 * sits more than 1px from every step. More than 10 percent of the measured
 * boxes off the scale is FIX. Exactly 10 percent still passes. No measured
 * boxes passes, with a reason.
 *
 * Steps are read from packages/engine/src/brand/tokens.ts. That file
 * publishes the contrast floors (body 4.5, large 3) and does not yet list
 * spacing steps. Until a SPACING_SCALE array or space-N lengths appear
 * there, the steps are the space-1 through space-8 lengths the engine
 * writes for every site beside those tokens, plus zero. Zero is on the
 * scale: a margin of none is not a miss. Font licenses are not checked.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** FIX when the off-scale share is above this. Exactly this share passes. */
export const SPACING_FIX_OVER = 0.1;

/** A length this close to a step, in pixels, is on the scale. */
export const SPACING_SNAP_PX = 1;

const WORST_OFFENDERS = 3;

export interface SpacingLength {
  kind: "margin" | "padding" | "gap";
  pixels: number;
}

export interface SpacingBox {
  /** Plain name, such as "the hero". It is repeated in the reason. */
  name: string;
  lengths: readonly SpacingLength[];
}

export interface SpacingMeasurement {
  boxes: readonly SpacingBox[];
}

export interface SpacingOffender {
  name: string;
  kind: SpacingLength["kind"];
  pixels: number;
  /** How far the length sits from the nearest step, in pixels. */
  distance: number;
}

export interface SpacingEvidence {
  measured: number;
  offScale: number;
  /** Off-scale boxes divided by measured boxes. Zero when nothing was measured. */
  ratio: number;
  scale: readonly number[];
  offenders: readonly SpacingOffender[];
}

export interface SpacingJudgement {
  status: "PASS" | "FIX";
  reason: string;
  evidence: SpacingEvidence;
}

export interface BrandScale {
  spacing: readonly number[];
  /** Body text floor. Same number as BODY_MIN in the brand tokens. */
  bodyContrast: number;
  /** Large text floor. Same number as LARGE_MIN in the brand tokens. */
  largeContrast: number;
}

let cached: BrandScale | null = null;

function findRepoFile(relative: string, missing: string): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let hop = 0; hop < 8; hop += 1) {
    const candidate = path.join(dir, ...relative.split("/"));
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(missing);
}

function readNumberList(text: string): number[] {
  const found: number[] = [];
  for (const part of text.split(",")) {
    const token = part.trim();
    if (token === "") continue;
    const value = Number(token);
    if (!Number.isFinite(value)) {
      throw new Error(`A spacing step is ${token}. Expected a pixel length.`);
    }
    found.push(value);
  }
  return found;
}

/**
 * Steps named in one source file.
 * An exported SPACING_SCALE array wins. Otherwise space-1: 4px lines count.
 * An empty result means the file names no steps. Zero is added when any
 * step is present.
 */
export function spacingStepsFromSource(source: string): number[] {
  const found = new Set<number>();
  const declared = /export\s+const\s+SPACING_SCALE\s*=\s*\[([^\]]*)\]/.exec(source);
  if (declared?.[1] !== undefined && declared[1].trim() !== "") {
    for (const value of readNumberList(declared[1])) found.add(value);
  } else {
    const step = /(?:--)?\bspace-\d+\s*:\s*"?(-?\d+(?:\.\d+)?)px"?/g;
    for (const match of source.matchAll(step)) {
      const raw = match[1];
      if (raw === undefined) continue;
      const value = Number(raw);
      if (Number.isFinite(value)) found.add(value);
    }
  }
  if (found.size === 0) return [];
  found.add(0);
  return [...found].sort((left, right) => left - right);
}

/** Body and large floors from the brand tokens source. */
export function contrastFloorsFromSource(source: string): { body: number; large: number } {
  const body = /const\s+BODY_MIN\s*=\s*(\d+(?:\.\d+)?)/.exec(source);
  const large = /const\s+LARGE_MIN\s*=\s*(\d+(?:\.\d+)?)/.exec(source);
  const bodyRaw = body?.[1];
  const largeRaw = large?.[1];
  if (bodyRaw === undefined || largeRaw === undefined) {
    throw new Error("The brand tokens file is missing the text contrast floors.");
  }
  return { body: Number(bodyRaw), large: Number(largeRaw) };
}

/**
 * Contrast floors from the brand tokens, and the spacing steps.
 * A scale declared in that file wins. Otherwise the site spacing block
 * written next to those tokens is used.
 */
export function loadBrandScale(): BrandScale {
  if (cached !== null) return cached;
  const tokens = readFileSync(
    findRepoFile("packages/engine/src/brand/tokens.ts", "The brand tokens file is missing."),
    "utf8",
  );
  const floors = contrastFloorsFromSource(tokens);
  let spacing = spacingStepsFromSource(tokens);
  if (spacing.length === 0) {
    const design = readFileSync(
      findRepoFile(
        "packages/engine/src/spec/design-outputs.ts",
        "The site spacing scale is missing.",
      ),
      "utf8",
    );
    spacing = spacingStepsFromSource(design);
  }
  if (spacing.length === 0) {
    throw new Error("The spacing scale is missing from the brand tokens file.");
  }
  cached = { spacing, bodyContrast: floors.body, largeContrast: floors.large };
  return cached;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readLength(value: unknown, index: number, edge: number): SpacingLength {
  if (!isRecord(value)) {
    throw new Error(`Box ${index} length ${edge} is missing.`);
  }
  if (value.kind !== "margin" && value.kind !== "padding" && value.kind !== "gap") {
    throw new Error(`Box ${index} length ${edge} must be a margin, padding, or gap.`);
  }
  if (typeof value.pixels !== "number" || !Number.isFinite(value.pixels)) {
    throw new Error(`Box ${index} length ${edge} needs a pixel number.`);
  }
  return { kind: value.kind, pixels: value.pixels };
}

function readBox(value: unknown, index: number): SpacingBox {
  if (!isRecord(value)) throw new Error(`Box ${index} is missing.`);
  if (typeof value.name !== "string" || value.name.trim() === "") {
    throw new Error(`Box ${index} needs a name.`);
  }
  if (!Array.isArray(value.lengths)) throw new Error(`Box ${index} needs its lengths.`);
  return {
    name: value.name.trim(),
    lengths: value.lengths.map((length, edge) => readLength(length, index, edge)),
  };
}

function readBoxes(input: SpacingMeasurement): SpacingBox[] {
  if (!isRecord(input) || !Array.isArray(input.boxes)) {
    throw new Error("Spacing input is missing its boxes.");
  }
  return input.boxes.map((box, index) => readBox(box, index));
}

function distanceToScale(pixels: number, scale: readonly number[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const step of scale) {
    const gap = Math.abs(pixels - step);
    if (gap < best) best = gap;
  }
  return best;
}

function formatPixels(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function edgeWord(kind: SpacingLength["kind"]): string {
  if (kind === "margin") return "margin";
  if (kind === "padding") return "padding";
  return "gap";
}

function offenderSentence(item: SpacingOffender): string {
  const size = formatPixels(item.pixels);
  const distance = formatPixels(item.distance);
  return `The ${edgeWord(item.kind)} on ${item.name} is ${size} pixels, which is ${distance} pixels off the spacing scale.`;
}

function worstOn(box: SpacingBox, scale: readonly number[]): SpacingOffender | null {
  let worst: SpacingOffender | null = null;
  for (const length of box.lengths) {
    const distance = distanceToScale(length.pixels, scale);
    if (worst === null || distance > worst.distance) {
      worst = { name: box.name, kind: length.kind, pixels: length.pixels, distance };
    }
  }
  return worst;
}

/**
 * Judge measured boxes against a spacing scale.
 * The default scale is the one read from the brand tokens.
 * A box with no lengths is not measured. A box is off-scale when any
 * length on it is more than 1px from every step.
 */
export function evaluateSpacing(
  input: SpacingMeasurement,
  scale: readonly number[] = loadBrandScale().spacing,
): SpacingJudgement {
  if (scale.length === 0) throw new Error("The spacing scale is missing.");
  const steps = [...scale].sort((left, right) => left - right);
  const boxes = readBoxes(input);
  const offenders: SpacingOffender[] = [];
  let measured = 0;
  for (const box of boxes) {
    if (box.lengths.length === 0) continue;
    measured += 1;
    const worst = worstOn(box, steps);
    if (worst !== null && worst.distance > SPACING_SNAP_PX) offenders.push(worst);
  }
  offenders.sort((left, right) => right.distance - left.distance || left.name.localeCompare(right.name));
  const ratio = measured === 0 ? 0 : offenders.length / measured;
  const evidence: SpacingEvidence = {
    measured,
    offScale: offenders.length,
    ratio,
    scale: steps,
    offenders,
  };
  if (measured === 0) {
    return { status: "PASS", reason: "No spacing was measured.", evidence };
  }
  const listed = offenders.slice(0, WORST_OFFENDERS).map(offenderSentence);
  if (offenders.length > WORST_OFFENDERS) listed.push("Other spacing is off the scale as well.");
  if (ratio > SPACING_FIX_OVER) {
    const reason = listed.length > 0 ? listed.join(" ") : "Too much spacing sits off the spacing scale.";
    return { status: "FIX", reason, evidence };
  }
  if (listed.length === 0) {
    return { status: "PASS", reason: "The spacing sits on the scale.", evidence };
  }
  return { status: "PASS", reason: ["The spacing is close enough.", ...listed].join(" "), evidence };
}
