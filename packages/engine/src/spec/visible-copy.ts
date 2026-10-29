/**
 * Visitor-copy gate for built HTML.
 * One pattern list covers placeholders, build narration, and plan metadata.
 * Comments, scripts, styles, and non-HTML files are not visitor copy.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export interface VisibleCopyPattern {
  id: string;
  source: string;
  flags: string;
  /** copy: visible text and visitor attributes. markup: production attributes. */
  scope: "copy" | "markup";
}

export const VISIBLE_COPY_PATTERNS: readonly VisibleCopyPattern[] = [
  { id: "todo", source: "\\bTODO\\b", flags: "", scope: "copy" },
  { id: "tbd", source: "\\bTBD\\b", flags: "", scope: "copy" },
  { id: "lorem", source: "\\blorem\\b", flags: "i", scope: "copy" },
  { id: "public-env", source: "PUBLIC_[A-Z_]+", flags: "", scope: "copy" },
  { id: "scripts-are-off", source: "Scripts are off", flags: "i", scope: "copy" },
  { id: "not-written-yet", source: "not written yet", flags: "i", scope: "copy" },
  { id: "does-not-mark-it", source: "does not mark it", flags: "i", scope: "copy" },
  { id: "this-control", source: "this control", flags: "i", scope: "copy" },
  { id: "data-job", source: "data-job\\s*=", flags: "i", scope: "markup" },
  { id: "data-launch-check", source: "data-launch-check\\s*=", flags: "i", scope: "markup" },
  { id: "data-component-path", source: "data-component\\s*=\\s*[\"'][^\"']*src/", flags: "i", scope: "markup" },
];

export interface VisibleCopyHit {
  file: string;
  snippet: string;
  patternId: string;
}

export interface VisibleCopyCount {
  file: string;
  patternId: string;
  count: number;
}

/** Counts taken over `dist` before a prompt's session starts. */
export interface VisibleCopyBaseline {
  /** False when `dist` was not a directory before the prompt. */
  distExisted: boolean;
  counts: VisibleCopyCount[];
}

const COPY_ATTR = /(?:^|[\s<])((?:data-copy-[\w:-]+|alt|title|content))\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
const PAGE_EDIT =
  /(?:^|[\s`'"(])(?:src\/pages\/|src\/app\/|src\/routes\/|src\/components\/|src\/layouts\/|src\/world\/)|\.astro\b|\+page\.svelte\b/i;
const QA_OR_LAUNCH = /REQ-GATE-|REQ-JURY|REQ-PRELAUNCH|REQ-LAUNCH|REQ-POST-DEPLOY|REQ-DEPLOY|REQ-ONCE-OVER/;
const COPY_PROMPT = /REQ-COPY-|REQ-ELEVATE-COPY/;
const HIT_CAP = 40;
const FILE_CAP = 2_000_000;

export function shouldScanVisibleCopy(promptText: string, files: readonly string[] = []): boolean {
  const task = taskText(promptText);
  const blob = `${task}\n${files.join("\n")}`;
  if (QA_OR_LAUNCH.test(blob) || COPY_PROMPT.test(blob)) return true;
  return PAGE_EDIT.test(blob);
}

export function scanVisibleCopy(root: string): VisibleCopyHit[] {
  const hits: VisibleCopyHit[] = [];
  const seen = new Set<string>();
  eachVisibleHit(root, (hit) => {
    const key = `${hit.file}\0${hit.patternId}\0${hit.snippet}`;
    if (seen.has(key)) return true;
    seen.add(key);
    hits.push(hit);
    return hits.length < HIT_CAP;
  });
  return sortHits(hits);
}

/** Hit counts per HTML file and pattern. Does not stop at the scan cap. */
export function countVisibleCopy(root: string): VisibleCopyCount[] {
  const totals = new Map<string, VisibleCopyCount>();
  eachVisibleHit(root, (hit) => {
    const key = `${hit.file}\0${hit.patternId}`;
    const row = totals.get(key);
    if (row !== undefined) row.count += 1;
    else totals.set(key, { file: hit.file, patternId: hit.patternId, count: 1 });
    return true;
  });
  return [...totals.values()].sort(
    (left, right) => left.file.localeCompare(right.file) || left.patternId.localeCompare(right.patternId),
  );
}

/** Every hit, in walk order. The scan cap does not apply. */
export function collectVisibleCopyHits(root: string): VisibleCopyHit[] {
  const hits: VisibleCopyHit[] = [];
  eachVisibleHit(root, (hit) => {
    hits.push(hit);
    return true;
  });
  return hits;
}

export function formatVisibleCopyFailure(hits: readonly VisibleCopyHit[], rootLabel = ""): string {
  if (hits.length === 0) return "";
  const prefix = rootLabel.replace(/\/+$/, "");
  const lines = hits.map((hit) => {
    const file = prefix === "" ? hit.file : `${prefix}/${hit.file}`;
    return `${file}: ${hit.snippet}`;
  });
  return `Visible copy failed.\n${lines.join("\n")}`;
}

const NO_BASELINE_NOTE =
  "No visible-copy baseline: dist did not exist before this prompt. Checked owned files only and did not fail pages outside them.";

export interface VisibleCopyJudgement {
  /** Empty when the prompt may pass. */
  reason: string;
  /** Run-log note. Empty when there is nothing to add. */
  note: string;
}

export interface VisibleCopyJudgeInput {
  /** QA and launch prompts fail on any hit in dist. */
  fullSite: boolean;
  baseline: VisibleCopyBaseline | null;
  counts: readonly VisibleCopyCount[];
  hits: readonly VisibleCopyHit[];
  ownedSourceHits: readonly VisibleCopyHit[];
  /** Dist-relative HTML paths for pages this prompt owns. */
  ownedDistFiles: readonly string[];
}

/**
 * QA and launch keep a full-site scan. Every other prompt fails only for
 * new hits, for a pattern in an owned source file, or for a hit on a page
 * it owns (that page is compared to an empty baseline, so a scaffold
 * placeholder on the prompt's own page still fails).
 */
export function judgeVisibleCopy(input: VisibleCopyJudgeInput): VisibleCopyJudgement {
  if (input.fullSite) {
    const shown = sortHits(dedupeHits(input.hits)).slice(0, HIT_CAP);
    return { reason: formatVisibleCopyFailure(shown, "dist"), note: "" };
  }
  const distExisted = input.baseline?.distExisted === true;
  const note = distExisted ? "" : NO_BASELINE_NOTE;
  const owned = new Set(input.ownedDistFiles);
  const baseline = new Map<string, number>();
  for (const row of input.baseline?.counts ?? []) baseline.set(countKey(row.file, row.patternId), row.count);
  const increased = new Set<string>();
  if (distExisted) {
    for (const row of input.counts) {
      const key = countKey(row.file, row.patternId);
      if (row.count > (baseline.get(key) ?? 0)) increased.add(key);
    }
  }
  const newHits = input.hits.filter((hit) => increased.has(countKey(hit.file, hit.patternId)) && !owned.has(hit.file));
  const ownedPageHits = input.hits.filter((hit) => owned.has(hit.file));
  const sections: string[] = [];
  if (newHits.length > 0) sections.push("New hits:", ...hitLines(newHits, "dist"));
  if (ownedPageHits.length > 0) sections.push("Owned page:", ...hitLines(ownedPageHits, "dist"));
  if (input.ownedSourceHits.length > 0) sections.push("Owned source:", ...hitLines(input.ownedSourceHits, ""));
  if (sections.length === 0) return { reason: "", note };
  return { reason: `Visible copy failed.\n${sections.join("\n")}`, note };
}

export function promptRequiresFullVisibleCopy(promptText: string, files: readonly string[] = []): boolean {
  const task = taskText(promptText);
  return QA_OR_LAUNCH.test(`${task}\n${files.join("\n")}`);
}

/** Dist HTML that a page source owns. A component path owns none. */
export function distHtmlForOwnedSource(rel: string): string[] {
  const norm = rel.replace(/\\/g, "/").replace(/^\.\//, "");
  const astro = /^src\/pages\/(.+)\.astro$/i.exec(norm);
  if (astro?.[1] !== undefined) return pageHtml(astro[1]);
  const app = /^src\/app\/(.*)$/i.exec(norm);
  if (app?.[1] !== undefined) {
    if (app[1] === "page.tsx" || app[1] === "page.jsx") return ["index.html"];
    const nested = /^(.*)\/page\.tsx$/i.exec(app[1]) ?? /^(.*)\/page\.jsx$/i.exec(app[1]);
    if (nested?.[1] !== undefined) return pageHtml(nested[1]);
  }
  const svelte = /^src\/routes\/(.*)$/i.exec(norm);
  if (svelte?.[1] !== undefined) {
    if (svelte[1] === "+page.svelte") return ["index.html"];
    const nested = /^(.*)\/\+page\.svelte$/i.exec(svelte[1]);
    if (nested?.[1] !== undefined) return pageHtml(nested[1]);
  }
  return [];
}

export function isVisitorSource(rel: string): boolean {
  return /\.(?:astro|html?|svelte|vue|jsx|tsx|mdx?)$/i.test(rel.replace(/\\/g, "/"));
}

/** Visitor text and copy attributes in a source file. Comments, frontmatter, scripts, and styles are ignored. */
export function scanVisibleCopyText(file: string, text: string): VisibleCopyHit[] {
  const rel = file.replace(/\\/g, "/");
  const stripped = stripCodeComments(stripFrontmatter(text));
  return hitsInHtml(rel, stripped);
}

export function parseVisibleCopyBaseline(value: unknown): VisibleCopyBaseline | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const row = value as { distExisted?: unknown; counts?: unknown };
  if (typeof row.distExisted !== "boolean" || !Array.isArray(row.counts)) return undefined;
  const counts: VisibleCopyCount[] = [];
  for (const item of row.counts) {
    if (typeof item !== "object" || item === null) continue;
    const hit = item as { file?: unknown; patternId?: unknown; count?: unknown };
    if (typeof hit.file !== "string" || typeof hit.patternId !== "string") continue;
    if (typeof hit.count !== "number" || !Number.isFinite(hit.count) || hit.count < 0) continue;
    counts.push({ file: hit.file.replace(/\\/g, "/"), patternId: hit.patternId, count: hit.count });
  }
  return { distExisted: row.distExisted, counts };
}

function countKey(file: string, patternId: string): string {
  return `${file}\0${patternId}`;
}

function pageHtml(route: string): string[] {
  const cleaned = route.replace(/\\/g, "/").replace(/\/index$/i, "").replace(/^\/+|\/+$/g, "");
  if (cleaned === "" || cleaned.toLowerCase() === "index") return ["index.html"];
  return [`${cleaned}/index.html`, `${cleaned}.html`];
}

function hitLines(hits: readonly VisibleCopyHit[], rootLabel: string): string[] {
  const unique = sortHits(dedupeHits(hits));
  const shown = unique.slice(0, HIT_CAP);
  const lines = shown.map((hit) => {
    const file = rootLabel === "" ? hit.file : `${rootLabel}/${hit.file}`;
    return `${file}: ${hit.snippet}`;
  });
  if (unique.length > shown.length) lines.push(`... and ${unique.length - shown.length} more`);
  return lines;
}

function dedupeHits(hits: readonly VisibleCopyHit[]): VisibleCopyHit[] {
  const seen = new Set<string>();
  const found: VisibleCopyHit[] = [];
  for (const hit of hits) {
    const key = `${hit.file}\0${hit.patternId}\0${hit.snippet}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(hit);
  }
  return found;
}

function eachVisibleHit(root: string, onHit: (hit: VisibleCopyHit) => boolean): void {
  if (!isDirectory(root)) return;
  for (const file of htmlFiles(root)) {
    let html = "";
    try {
      if (statSync(file).size > FILE_CAP) continue;
      html = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const rel = path.relative(root, file).split("\\").join("/");
    for (const hit of hitsInHtml(rel, html)) {
      if (!onHit(hit)) return;
    }
  }
}

function stripFrontmatter(text: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(text);
  if (match === null || match.index !== 0) return text;
  return text.slice(match[0].length);
}

function stripCodeComments(text: string): string {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/gm, "$1");
}

function taskText(promptText: string): string {
  const start = promptText.search(/^## Task\s*$/m);
  if (start === -1) return promptText;
  const after = promptText.slice(start);
  const next = after.search(/\n## (?!Task\b)/);
  return next === -1 ? after : after.slice(0, next);
}

function hitsInHtml(file: string, html: string): VisibleCopyHit[] {
  const visible = stripCode(stripComments(html));
  const hits: VisibleCopyHit[] = [];
  for (const pattern of VISIBLE_COPY_PATTERNS) {
    if (pattern.scope === "markup") {
      for (const match of findMatches(visible, pattern)) {
        hits.push({ file, patternId: pattern.id, snippet: clipAround(visible, match.index, match.length) });
      }
      continue;
    }
    for (const attr of attributes(visible)) {
      if (!matches(attr.value, pattern)) continue;
      hits.push({ file, patternId: pattern.id, snippet: clip(attr.shown) });
    }
    const text = visible.replace(/<[^>]+>/g, " ");
    for (const match of findMatches(text, pattern)) {
      hits.push({ file, patternId: pattern.id, snippet: clipAround(text, match.index, match.length) });
    }
  }
  return hits;
}

function attributes(html: string): Array<{ shown: string; value: string }> {
  const found: Array<{ shown: string; value: string }> = [];
  for (const match of html.matchAll(COPY_ATTR)) {
    const shown = (match[0] ?? "").replace(/^[<\s]+/, "").trim();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (shown === "") continue;
    found.push({ shown, value });
  }
  return found;
}

function findMatches(text: string, pattern: VisibleCopyPattern): Array<{ index: number; length: number }> {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  const found: Array<{ index: number; length: number }> = [];
  for (const match of text.matchAll(regex)) {
    if (match.index === undefined || match[0] === undefined) continue;
    found.push({ index: match.index, length: match[0].length });
  }
  return found;
}

function matches(text: string, pattern: VisibleCopyPattern): boolean {
  return new RegExp(pattern.source, pattern.flags).test(text);
}

function stripComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

function stripCode(html: string): string {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
}

function clipAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 48);
  const end = Math.min(text.length, index + Math.max(length, 96));
  return clip(text.slice(start, end));
}

function clip(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 180);
}

function sortHits(hits: VisibleCopyHit[]): VisibleCopyHit[] {
  return hits.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.patternId.localeCompare(right.patternId) ||
      left.snippet.localeCompare(right.snippet),
  );
}

function htmlFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    let entries: Array<{ name: string; directory: boolean; file: boolean }>;
    try {
      entries = readdirSync(dir, { withFileTypes: true }).map((entry) => ({
        name: String(entry.name),
        directory: entry.isDirectory(),
        file: entry.isFile(),
      }));
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const abs = path.join(dir, entry.name);
      if (entry.directory) {
        walk(abs);
        continue;
      }
      if (entry.file && /\.html?$/i.test(entry.name)) found.push(abs);
    }
  };
  walk(root);
  found.sort((left, right) => left.localeCompare(right));
  return found;
}

function isDirectory(root: string): boolean {
  try {
    return statSync(root).isDirectory();
  } catch {
    return false;
  }
}
