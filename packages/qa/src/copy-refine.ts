/**
 * Post-build copy refinement (prompt 131, Q15, Q30).
 *
 * Grok proposes rewrites for headings, calls to action, and microcopy.
 * Each line must pass the site anti-slop linter and both claim checks.
 * An exclamation mark or a banned word drops that line. Nothing is written
 * until approveCopy receives an explicit yes for that id. Approved lines
 * become one copy prompt.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  lintBrandClaims,
  lintClaims,
  validateJson,
  type Evidence,
  type Facts,
  type JsonSchema,
  type think,
} from "@hitchhiker/engine";
import { lintSlop } from "./antislop.ts";

export const COPY_REFINE_TASK = "copy-refine";

export const COPY_CAP = 8;

export const COPY_REFINE_SCHEMA: JsonSchema = {
  type: "object",
  required: ["rewrites"],
  properties: {
    rewrites: {
      type: "array",
      maxItems: COPY_CAP,
      items: {
        type: "object",
        required: ["id", "before", "after", "why"],
        properties: {
          id: { type: "string", maxLength: 80 },
          before: { type: "string", maxLength: 400 },
          after: { type: "string", maxLength: 400 },
          why: { type: "string", maxLength: 240 },
        },
      },
    },
  },
};

export interface CopyProposal {
  id: string;
  before: string;
  after: string;
  why: string;
}

export interface CopyDecision {
  id: string;
  approve: boolean;
}

export interface ApprovedCopy {
  file: string | null;
  approved: string[];
  rejected: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function calm(value: string): string {
  return value.replaceAll("!", ".").replaceAll("\u2014", "-").replace(/[\r\n]+/g, " ").trim();
}

function asText(value: string): string {
  if (value.includes("\n") || value.includes("\r") || value.length > 240) return value;
  try {
    if (existsSync(value) && statSync(value).isFile()) return readFileSync(value, "utf8");
  } catch {
    return value;
  }
  return value;
}

function factsFrom(source: string): Facts {
  return {
    answers: [{ id: "source", value: source }],
    uploads: [],
    crawlNotes: [],
  };
}

function evidenceFrom(source: string): Evidence {
  const numbers: string[] = [];
  for (const match of source.matchAll(/\d+/g)) {
    const digits = match[0];
    if (digits !== undefined && digits.length > 0) numbers.push(digits);
  }
  const quoted = /\bstars?\b/i.test(source) || source.includes("\"") || /\btestimonials?\b/i.test(source);
  const awarded = /\bawards?\b/i.test(source);
  return {
    quotes: quoted ? [source] : [],
    awards: awarded ? [source] : [],
    numbers,
  };
}

function acceptable(after: string, why: string, source: string): boolean {
  if (lintSlop(`${after}\n${why}`, "site").length > 0) return false;
  if (!lintBrandClaims(after, evidenceFrom(source)).ok) return false;
  if (lintClaims(after, factsFrom(source)).length > 0) return false;
  return true;
}

function cleanId(value: string, index: number): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  if (cleaned.length === 0) return `copy-${String(index + 1).padStart(2, "0")}`;
  return cleaned;
}

function readRewrites(value: unknown): Array<{ id: string; before: string; after: string; why: string }> {
  if (!isRecord(value) || !Array.isArray(value.rewrites)) {
    throw new Error("copy-refine schema failed: rewrites is missing.");
  }
  const rows: Array<{ id: string; before: string; after: string; why: string }> = [];
  for (const item of value.rewrites) {
    if (!isRecord(item)) continue;
    if (
      typeof item.id !== "string" ||
      typeof item.before !== "string" ||
      typeof item.after !== "string" ||
      typeof item.why !== "string"
    ) {
      continue;
    }
    rows.push({
      id: item.id.trim(),
      before: item.before.trim(),
      after: item.after.trim(),
      why: item.why.trim(),
    });
  }
  return rows.slice(0, COPY_CAP);
}

function copyInput(pages: readonly string[], voice: string): string {
  const body = pages.map((page, index) => `PAGE ${index + 1}\n${page.slice(0, 8000)}`).join("\n\n");
  return [
    "Rewrite headings, calls to action, and microcopy in this voice.",
    "Each rewrite quotes the current line as before and offers one replacement as after.",
    "Say why in one plain sentence.",
    "Do not add an exclamation mark, a banned word, an em dash, or a number that is not already on the page.",
    "Do not invent a review, a rating, or an award.",
    "",
    "VOICE",
    voice.slice(0, 4000),
    "",
    "PAGES",
    body,
  ].join("\n");
}

function repoRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let hop = 0; hop < 8; hop += 1) {
    const marker = path.join(dir, "packages", "knowledge", "golden", "elevate-copy.md");
    if (existsSync(marker)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("The golden copy template is missing.");
}

/**
 * Propose voice-consistent rewrites. Lines that fail the linters are omitted.
 * This function does not write a file.
 */
export async function proposeCopy(
  pages: readonly string[],
  voice: string,
  deps: { think: typeof think },
): Promise<CopyProposal[]> {
  if (!isRecord(deps) || typeof deps.think !== "function") {
    throw new Error("proposeCopy needs think.");
  }
  const texts = pages.filter((page) => typeof page === "string").map((page) => asText(page));
  if (texts.length === 0 || texts.every((page) => page.trim().length === 0)) return [];
  const voiceText = asText(voice);
  const source = texts.join("\n");
  const result = await deps.think({
    task: COPY_REFINE_TASK,
    schema: COPY_REFINE_SCHEMA,
    effort: "xhigh",
    input: copyInput(texts, voiceText),
  });
  const errors = validateJson(result.value, COPY_REFINE_SCHEMA);
  if (errors.length > 0) throw new Error(`copy-refine schema failed: ${errors.join("; ")}`);

  const proposals: CopyProposal[] = [];
  const used = new Set<string>();
  for (const row of readRewrites(result.value)) {
    if (row.before.length === 0 || row.after.length === 0 || row.why.length === 0) continue;
    if (row.before === row.after) continue;
    if (!source.includes(row.before)) continue;
    if (!acceptable(row.after, row.why, source)) continue;
    const base = cleanId(row.id, proposals.length);
    let id = base;
    let salt = 2;
    while (used.has(id) && salt < 20) {
      id = `${base}-${salt}`.slice(0, 40);
      salt += 1;
    }
    if (used.has(id)) continue;
    used.add(id);
    proposals.push({ id, before: row.before, after: row.after, why: calm(row.why) });
    if (proposals.length >= COPY_CAP) break;
  }
  return proposals;
}

/** Approve or reject cards. Pending until a decision names the id. */
export function copyCards(proposals: readonly CopyProposal[]): string {
  if (proposals.length === 0) return "No copy changes.\n";
  return proposals
    .map((item) =>
      [item.id, `before: ${item.before}`, `after: ${item.after}`, `why: ${item.why}`, "approve or reject", ""].join("\n"),
    )
    .join("\n");
}

/**
 * Write one copy prompt for the approved ids. A missing decision is a reject.
 * A line that fails the linters again is not written.
 */
export async function approveCopy(
  projectDir: string,
  proposals: readonly CopyProposal[],
  decisions: readonly CopyDecision[],
): Promise<ApprovedCopy> {
  const decision = new Map<string, boolean>();
  for (const row of decisions) {
    if (typeof row.id !== "string" || decision.has(row.id)) continue;
    decision.set(row.id, row.approve === true);
  }
  const source = proposals.map((item) => item.before).join("\n");
  const approved: CopyProposal[] = [];
  const rejected: string[] = [];
  for (const item of proposals) {
    const yes = decision.get(item.id) === true && acceptable(item.after, item.why, source);
    if (yes && approved.length < COPY_CAP) approved.push(item);
    else rejected.push(item.id);
  }
  if (approved.length === 0) return { file: null, approved: [], rejected };

  const template = readFileSync(path.join(repoRoot(), "packages", "knowledge", "golden", "elevate-copy.md"), "utf8");
  const filled = template
    .replaceAll("{{files}}", "copy")
    .replaceAll("{{library}}", "vanilla")
    .replaceAll("{{element}}", "copy")
    .replaceAll("{{page}}", "/")
    .replaceAll("{{section}}", "copy")
    .replaceAll("{{anchor}}", "voice");
  const table = approved
    .map(
      (item, index) =>
        `${index + 1}. ${item.id}\nbefore: ${item.before}\nafter: ${item.after}\nwhy: ${item.why}`,
    )
    .join("\n\n");
  const body = [
    filled.trim(),
    "",
    "Apply only the approved rewrites below. Leave every other line as it is.",
    "",
    table,
    "",
  ].join("\n");
  const dir = path.join(projectDir, ".hitchhiker", "prompts", "elevate");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "copy.md");
  await writeFile(file, body, "utf8");
  return { file, approved: approved.map((item) => item.id), rejected };
}
