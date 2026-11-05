/**
 * Presence, budget, and competition checks for locked signature moments.
 * The public gate lives in @hitchhiker/qa so reduced motion can use the
 * optical checker. This module is the engine fallback when qa is not loaded.
 * Engine cannot import qa.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { ParsedSignatureMoment } from "./design-md-lint.ts";
import { readSignatureMoments, sectionHostsMoment } from "./signature-moments.ts";

export interface SignatureRuntimeReading {
  id: string;
  /** True when a scroll or interaction changed the moment's trigger or progress. */
  moved: boolean;
}

export interface SignatureMeasure {
  id: string;
  jsKb?: number;
  frameMs?: number;
  lcpSeconds?: number;
  cls?: number;
}

/** Same shape the optical reduced-motion judge reads. animates is applied in qa. */
export interface SignatureReducedSample {
  id: string;
  selector: string;
  present: boolean;
  opacity: number;
  offCanvas: boolean;
  keepsLayout: boolean;
  blank: boolean;
}

export interface SignatureAuditFailure {
  id: string;
  code: "missing-hook" | "missing-recipe" | "runtime" | "budget" | "competing" | "reduced-motion";
  message: string;
  file?: string;
  line?: number;
}

export interface SignatureBuilt {
  root?: string;
  /** CDP readings. When present they replace the source stand-in. */
  runtime?: readonly SignatureRuntimeReading[];
  reduced?: readonly SignatureReducedSample[];
  measures?: readonly SignatureMeasure[];
}

export interface SignatureAudit {
  failures: SignatureAuditFailure[];
  reduced: SignatureReducedSample[];
}

const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".astro", ".svelte", ".vue", ".css", ".html"]);
const HERO_FAMILY: Record<string, string> = {
  pinnedTimeline: "pinned",
  scrollCamera: "camera",
  frameSequence: "frame-sequence",
  horizontalTrack: "horizontal",
};

interface SourceFile {
  rel: string;
  text: string;
  bytes: number;
}

/** Checks locked moments against source. An empty contract passes. */
export function auditSignature(projectDir: string, built?: string | SignatureBuilt): SignatureAudit {
  const moments = readSignatureMoments(projectDir);
  if (moments.length === 0) return { failures: [], reduced: [] };
  const probe = asProbe(built);
  const files = scanRoots(projectDir, probe.root);
  const failures: SignatureAuditFailure[] = [];
  const reduced: SignatureReducedSample[] = [];
  for (const moment of moments) {
    judgeMoment(moment, files, probe, failures, reduced);
  }
  return { failures, reduced };
}

function judgeMoment(
  moment: ParsedSignatureMoment,
  files: readonly SourceFile[],
  probe: SignatureBuilt,
  failures: SignatureAuditFailure[],
  reduced: SignatureReducedSample[],
): void {
  const hosts = files.filter((file) => fileMatchesSection(file, moment.section));
  const hooked = hosts.find((file) => hasHook(file.text, moment.id));
  if (hooked === undefined) {
    failures.push({
      id: moment.id,
      code: "missing-hook",
      message: `Signature ${moment.id} is missing data-signature="${moment.id}" on ${moment.section}.`,
    });
  } else {
    if (!new RegExp(`\\b${moment.recipe}\\b`).test(hooked.text)) {
      failures.push({
        id: moment.id,
        code: "missing-recipe",
        message: `Signature ${moment.id} does not use recipe ${moment.recipe} in ${hooked.rel}.`,
        file: hooked.rel,
      });
    }
    judgeRuntime(moment, hooked, probe.runtime, failures);
    judgeBudget(moment, hooked, probe.measures, failures);
    judgeReduced(moment, hooked, files, reduced, failures);
  }
  judgeCompetition(moment, files, failures);
}

function judgeRuntime(
  moment: ParsedSignatureMoment,
  host: SourceFile,
  runtime: readonly SignatureRuntimeReading[] | undefined,
  failures: SignatureAuditFailure[],
): void {
  if (runtime !== undefined) {
    const reading = runtime.find((item) => item.id === moment.id);
    if (reading === undefined || reading.moved !== true) {
      failures.push({
        id: moment.id,
        code: "runtime",
        message: `Signature ${moment.id} did not change progress on scroll or interaction.`,
        file: host.rel,
      });
    }
    return;
  }
  const standIn = /\bprogress\b/.test(host.text) && /\b(?:scroll|click|pointer)\b/.test(host.text);
  if (!standIn) {
    failures.push({
      id: moment.id,
      code: "runtime",
      message: `Signature ${moment.id} did not change progress on scroll or interaction.`,
      file: host.rel,
    });
  }
}

function judgeBudget(
  moment: ParsedSignatureMoment,
  host: SourceFile,
  measures: readonly SignatureMeasure[] | undefined,
  failures: SignatureAuditFailure[],
): void {
  const budget = moment.budget;
  if (budget === null) {
    failures.push({
      id: moment.id,
      code: "budget",
      message: `Signature ${moment.id} is missing a performance budget.`,
      file: host.rel,
    });
    return;
  }
  const kb = host.bytes / 1024;
  if (kb > budget.maxJsKb) {
    failures.push({
      id: moment.id,
      code: "budget",
      message: `Signature ${moment.id} JS is ${trim(kb)} kB, over maxJsKb ${trim(budget.maxJsKb)}, in ${host.rel}.`,
      file: host.rel,
    });
  }
  const measured = measures?.find((item) => item.id === moment.id);
  if (measured === undefined) return;
  if (measured.jsKb !== undefined && measured.jsKb > budget.maxJsKb) {
    failures.push({
      id: moment.id,
      code: "budget",
      message: `Signature ${moment.id} JS is ${trim(measured.jsKb)} kB, over maxJsKb ${trim(budget.maxJsKb)}, in ${host.rel}.`,
      file: host.rel,
    });
  }
  if (measured.frameMs !== undefined && measured.frameMs > budget.maxFrameMs) {
    failures.push({
      id: moment.id,
      code: "budget",
      message: `Signature ${moment.id} main thread is ${trim(measured.frameMs)} ms per frame, over maxFrameMs ${trim(budget.maxFrameMs)}, in ${host.rel}.`,
      file: host.rel,
    });
  }
  if (measured.lcpSeconds !== undefined && measured.lcpSeconds > budget.lcp) {
    failures.push({
      id: moment.id,
      code: "budget",
      message: `Signature ${moment.id} LCP is ${trim(measured.lcpSeconds)}s, over ${trim(budget.lcp)}s, in ${host.rel}.`,
      file: host.rel,
    });
  }
  if (measured.cls !== undefined && measured.cls > budget.cls) {
    failures.push({
      id: moment.id,
      code: "budget",
      message: `Signature ${moment.id} CLS is ${trim(measured.cls)}, over ${trim(budget.cls)}, in ${host.rel}.`,
      file: host.rel,
    });
  }
}

function judgeReduced(
  moment: ParsedSignatureMoment,
  host: SourceFile,
  files: readonly SourceFile[],
  reduced: SignatureReducedSample[],
  failures: SignatureAuditFailure[],
): void {
  const css = [host.text, ...files.filter((file) => file.rel.endsWith(".css") && file.text.includes(moment.id)).map((file) => file.text)].join("\n");
  const sample = sampleFromCss(moment.id, css);
  if (sample === null) {
    failures.push({
      id: moment.id,
      code: "reduced-motion",
      message: `Signature ${moment.id} reduced-motion fallback is not designed.`,
      file: host.rel,
    });
    return;
  }
  reduced.push(sample);
  if (sampleHidden(sample)) {
    failures.push({
      id: moment.id,
      code: "reduced-motion",
      message: `Signature ${moment.id} reduced-motion fallback is hidden.`,
      file: host.rel,
    });
  }
}

function judgeCompetition(
  moment: ParsedSignatureMoment,
  files: readonly SourceFile[],
  failures: SignatureAuditFailure[],
): void {
  for (const file of files) {
    if (fileMatchesSection(file, moment.section)) continue;
    if (moment.echoes.some((echo) => fileMatchesSection(file, echo))) continue;
    const hit = competingUse(file, moment.recipe);
    if (hit === null) continue;
    failures.push({
      id: moment.id,
      code: "competing",
      message: `Signature ${moment.id} competes with ${hit.family} motion in ${file.rel}:${hit.line}.`,
      file: file.rel,
      line: hit.line,
    });
  }
}

function competingUse(file: SourceFile, momentRecipe: string): { family: string; line: number } | null {
  const viewport = /100\s*d?vh/.test(file.text);
  const momentFamily = HERO_FAMILY[momentRecipe];
  for (const [recipe, family] of Object.entries(HERO_FAMILY)) {
    const line = lineOf(file.text, new RegExp(`\\b${recipe}\\b`));
    if (line < 0) continue;
    const same = momentFamily !== undefined && momentFamily === family;
    if (!same && !viewport) continue;
    return { family: same ? family : "full-viewport", line };
  }
  return null;
}

function sampleFromCss(id: string, text: string): SignatureReducedSample | null {
  const blocks = reducedBlocks(text);
  if (blocks.length === 0) return null;
  const named = blocks.find((block) => block.includes(id) || block.includes("data-signature"));
  const block = named ?? blocks[0] ?? "";
  const opacity = /opacity\s*:\s*([0-9.]+)/i.exec(block);
  const displayNone = /display\s*:\s*none/i.test(block);
  const visibilityHidden = /visibility\s*:\s*hidden/i.test(block);
  const opacityValue = opacity?.[1] !== undefined ? Number(opacity[1]) : 1;
  const removed = displayNone || visibilityHidden;
  return {
    id,
    selector: `[data-signature="${id}"]`,
    present: !removed,
    opacity: removed ? 0 : opacityValue,
    offCanvas: false,
    keepsLayout: !removed,
    blank: false,
  };
}

function sampleHidden(sample: SignatureReducedSample): boolean {
  return !sample.present || sample.opacity < 0.99 || sample.offCanvas || !sample.keepsLayout || sample.blank;
}

function reducedBlocks(text: string): string[] {
  const blocks: string[] = [];
  const re = /@media[^{]*prefers-reduced-motion\s*:\s*reduce[^{]*\{/gi;
  for (const match of text.matchAll(re)) {
    const start = (match.index ?? 0) + match[0].length;
    let depth = 1;
    let index = start;
    while (index < text.length && depth > 0) {
      const char = text[index];
      if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      index += 1;
    }
    blocks.push(text.slice(start, Math.max(start, index - 1)));
  }
  return blocks;
}

function fileMatchesSection(file: SourceFile, section: string): boolean {
  const attr = /data-section\s*=\s*["']([^"']+)["']/.exec(file.text);
  if (attr?.[1] !== undefined && sectionHostsMoment(attr[1], section)) return true;
  const base = path.basename(file.rel, path.extname(file.rel));
  return sectionHostsMoment(base, section);
}

function hasHook(text: string, id: string): boolean {
  // A CSS attribute selector is not the hook. The hosting element is.
  return new RegExp(`(?<!\\[)data-signature\\s*=\\s*["']${escapeRegExp(id)}["']`).test(text);
}

function scanRoots(projectDir: string, extra: string | undefined): SourceFile[] {
  const roots = [projectDir];
  if (extra !== undefined && extra.trim() !== "" && path.resolve(extra) !== path.resolve(projectDir)) roots.push(extra);
  const seen = new Set<string>();
  const files: SourceFile[] = [];
  for (const root of roots) {
    for (const file of walkSource(root)) {
      if (seen.has(file.rel)) continue;
      seen.add(file.rel);
      files.push(file);
    }
  }
  return files;
}

function walkSource(root: string): SourceFile[] {
  const src = path.join(root, "src");
  const start = existsSync(src) ? src : root;
  const files: SourceFile[] = [];
  walk(start, root, files);
  return files;
}

function walk(dir: string, root: string, into: SourceFile[]): void {
  let entries: { name: string; isDirectory: () => boolean; isFile: () => boolean }[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".hitchhiker" || entry.name.startsWith(".")) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, root, into);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!SOURCE_EXT.has(path.extname(entry.name).toLowerCase())) continue;
    let text = "";
    let bytes = 0;
    try {
      text = readFileSync(full, "utf8");
      bytes = statSync(full).size;
    } catch {
      continue;
    }
    into.push({ rel: path.relative(root, full).replaceAll("\\", "/"), text, bytes });
  }
}

function asProbe(built: string | SignatureBuilt | undefined): SignatureBuilt {
  if (typeof built === "string") return { root: built };
  return built ?? {};
}

function lineOf(text: string, pattern: RegExp): number {
  const match = pattern.exec(text);
  if (match === null || match.index === undefined) return -1;
  return text.slice(0, match.index).split("\n").length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}
