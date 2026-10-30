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
  /** 1-based line in an owned source file. Dist hits leave this unset. */
  line?: number;
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
 * QA and launch keep a full-site scan. Every other prompt fails for a
 * pattern in an owned source file, for a hit that appears only on a page
 * it owns, or when a file and pattern count went up versus the baseline.
 * A hit on an owned page whose pattern and snippet also appear on a dist
 * page the prompt does not own is shared chrome. That hit uses the
 * increased-count rule. With no baseline, shared chrome does not fail.
 */
export function judgeVisibleCopy(input: VisibleCopyJudgeInput): VisibleCopyJudgement {
  if (input.fullSite) {
    const shown = sortHits(dedupeHits(input.hits)).slice(0, HIT_CAP);
    return { reason: formatVisibleCopyFailure(shown, "dist"), note: "" };
  }
  const distExisted = input.baseline?.distExisted === true;
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
  const shared = sharedChromeKeys(input.hits, owned);
  const onOwned = (hit: VisibleCopyHit): boolean => owned.has(hit.file);
  const isShared = (hit: VisibleCopyHit): boolean => shared.has(chromeKey(hit));
  const newHits = input.hits.filter((hit) => increased.has(countKey(hit.file, hit.patternId)) && !onOwned(hit));
  const ownedPageHits = input.hits.filter((hit) => onOwned(hit) && !isShared(hit));
  const sharedOnOwned = input.hits.filter((hit) => onOwned(hit) && isShared(hit));
  const sharedHits = distExisted
    ? sharedOnOwned.filter((hit) => increased.has(countKey(hit.file, hit.patternId)))
    : [];
  let note = distExisted ? "" : NO_BASELINE_NOTE;
  if (!distExisted && sharedOnOwned.length > 0) {
    note = `${NO_BASELINE_NOTE} Shared chrome on an owned page was not failed.`;
  }
  const sections: string[] = [];
  if (newHits.length > 0) sections.push("New hits:", ...hitLines(newHits, "dist"));
  if (ownedPageHits.length > 0) sections.push("Owned page:", ...hitLines(ownedPageHits, "dist"));
  if (sharedHits.length > 0) sections.push("Shared chrome:", ...hitLines(sharedHits, "dist"));
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
  const prepared = prepareOwnedVisible(text);
  return hitsInHtml(rel, prepared.visible, prepared);
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

function chromeKey(hit: VisibleCopyHit): string {
  return `${hit.patternId}\0${hit.snippet}`;
}

/** Pattern and snippet pairs that already show on a page this prompt does not own. */
function sharedChromeKeys(hits: readonly VisibleCopyHit[], owned: ReadonlySet<string>): Set<string> {
  const keys = new Set<string>();
  for (const hit of hits) {
    if (owned.has(hit.file)) continue;
    keys.add(chromeKey(hit));
  }
  return keys;
}

function pageHtml(route: string): string[] {
  const cleaned = route.replace(/\\/g, "/").replace(/\/index$/i, "").replace(/^\/+|\/+$/g, "");
  if (cleaned === "" || cleaned.toLowerCase() === "index") return ["index.html"];
  return [`${cleaned}/index.html`, `${cleaned}.html`];
}

function hitLines(hits: readonly VisibleCopyHit[], rootLabel: string): string[] {
  const unique = sortHits(dedupeHits(hits));
  const shown = unique.slice(0, HIT_CAP);
  const lines = shown.map((hit) => formatHitLine(hit, rootLabel));
  if (unique.length > shown.length) lines.push(`... and ${unique.length - shown.length} more`);
  return lines;
}

/** Owned-source lines keep the raw attribute. Dist lines stay `file: snippet`. */
export function formatHitLine(hit: VisibleCopyHit, rootLabel = ""): string {
  const file = rootLabel === "" ? hit.file : `${rootLabel}/${hit.file}`;
  if (hit.line !== undefined && rootLabel === "") return `${file}:${hit.line} ${hit.snippet}`;
  return `${file}: ${hit.snippet}`;
}

const FIX_BEFORE_INSTRUCTION =
  "Remove the plan metadata attribute or guard it with `import.meta.env.DEV`. Replace TODO and build narration with visitor copy.";

/**
 * Engine-owned block for the session text. Empty when there is nothing to fix.
 * `failureReason` is the close-check reason from a recovery rerun.
 */
export function formatFixBeforeFinish(hits: readonly VisibleCopyHit[], failureReason = ""): string {
  const reason = failureReason.trim();
  const shown = sortHits(dedupeHits(hits)).slice(0, HIT_CAP);
  const failed = reason.startsWith("Visible copy failed.");
  if (shown.length === 0 && !failed) return "";
  const lines = ["## Fix before you finish", ""];
  if (failed) lines.push(reason, "");
  for (const hit of shown) lines.push(formatHitLine(hit));
  if (shown.length > 0) lines.push("");
  lines.push(FIX_BEFORE_INSTRUCTION);
  return `${lines.join("\n")}\n`;
}

function dedupeHits(hits: readonly VisibleCopyHit[]): VisibleCopyHit[] {
  const seen = new Set<string>();
  const found: VisibleCopyHit[] = [];
  for (const hit of hits) {
    const key = `${hit.file}\0${hit.line ?? ""}\0${hit.patternId}\0${hit.snippet}`;
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

function taskText(promptText: string): string {
  const start = promptText.search(/^## Task\s*$/m);
  if (start === -1) return promptText;
  const after = promptText.slice(start);
  const next = after.search(/\n## (?!Task\b)/);
  return next === -1 ? after : after.slice(0, next);
}

interface OwnedVisible {
  /** Original source, including frontmatter and comments. */
  original: string;
  /** Index in `visible` to index in `original`. */
  map: number[];
  visible: string;
}

function hitsInHtml(file: string, html: string, owned: OwnedVisible | null = null): VisibleCopyHit[] {
  const visible = owned === null ? stripCode(stripComments(html)) : html;
  const hits: VisibleCopyHit[] = [];
  const masked = maskTags(visible);
  for (const pattern of VISIBLE_COPY_PATTERNS) {
    if (pattern.scope === "markup") {
      for (const match of findMatches(visible, pattern)) {
        const at = owned === null ? -1 : originalIndex(owned, match.index);
        if (owned !== null && markupGuarded(owned.original, at)) continue;
        const hit: VisibleCopyHit = {
          file,
          patternId: pattern.id,
          snippet: owned === null ? clipAround(visible, match.index, match.length) : rawAttribute(owned.original, at, match.length),
        };
        if (owned !== null) hit.line = lineNumber(owned.original, at);
        hits.push(hit);
      }
      continue;
    }
    for (const attr of attributes(visible)) {
      if (!matches(attr.value, pattern)) continue;
      const hit: VisibleCopyHit = { file, patternId: pattern.id, snippet: clip(attr.shown) };
      if (owned !== null) hit.line = lineNumber(owned.original, originalIndex(owned, attr.index));
      hits.push(hit);
    }
    for (const match of findMatches(masked.text, pattern)) {
      if (owned === null) {
        hits.push({ file, patternId: pattern.id, snippet: clipAround(masked.text, match.index, match.length) });
        continue;
      }
      const at = originalIndex(owned, masked.map[match.index] ?? 0);
      hits.push({
        file,
        patternId: pattern.id,
        snippet: rawAround(owned.original, at, match.length),
        line: lineNumber(owned.original, at),
      });
    }
  }
  return hits;
}

function attributes(html: string): Array<{ shown: string; value: string; index: number }> {
  const found: Array<{ shown: string; value: string; index: number }> = [];
  for (const match of html.matchAll(COPY_ATTR)) {
    const shown = (match[0] ?? "").replace(/^[<\s]+/, "").trim();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (shown === "") continue;
    found.push({ shown, value, index: match.index ?? 0 });
  }
  return found;
}

function originalIndex(owned: OwnedVisible, visibleIndex: number): number {
  return owned.map[visibleIndex] ?? visibleIndex;
}

function prepareOwnedVisible(text: string): OwnedVisible {
  let current = text;
  let map = Array.from({ length: text.length }, (_, index) => index);
  const front = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(current);
  if (front !== null && front.index === 0) {
    current = current.slice(front[0].length);
    map = map.slice(front[0].length);
  }
  const steps: Array<{ regex: RegExp; keepPrefix: boolean }> = [
    { regex: /\{\/\*[\s\S]*?\*\/\}/g, keepPrefix: false },
    { regex: /\/\*[\s\S]*?\*\//g, keepPrefix: false },
    { regex: /(^|[^:])\/\/[^\n]*/gm, keepPrefix: true },
    { regex: /<!--[\s\S]*?-->/g, keepPrefix: false },
    { regex: /<script\b[^>]*>[\s\S]*?<\/script>/gi, keepPrefix: false },
    { regex: /<style\b[^>]*>[\s\S]*?<\/style>/gi, keepPrefix: false },
  ];
  for (const step of steps) {
    const next = excise(current, map, step.regex, step.keepPrefix);
    current = next.text;
    map = next.map;
  }
  return { original: text, visible: current, map };
}

function excise(
  text: string,
  map: number[],
  regex: RegExp,
  keepPrefix: boolean,
): { text: string; map: number[] } {
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  const re = new RegExp(regex.source, flags);
  const chars: string[] = [];
  const next: number[] = [];
  let last = 0;
  for (const match of text.matchAll(re)) {
    if (match.index === undefined || match[0] === undefined || match[0].length === 0) continue;
    const start = match.index;
    const keep = keepPrefix ? (match[1]?.length ?? 0) : 0;
    const cut = start + keep;
    for (let index = last; index < cut; index += 1) {
      chars.push(text[index] ?? "");
      next.push(map[index] ?? index);
    }
    last = start + match[0].length;
  }
  for (let index = last; index < text.length; index += 1) {
    chars.push(text[index] ?? "");
    next.push(map[index] ?? index);
  }
  return { text: chars.join(""), map: next };
}

function maskTags(visible: string): { text: string; map: number[] } {
  const chars: string[] = [];
  const map: number[] = [];
  let last = 0;
  for (const match of visible.matchAll(/<[^>]+>/g)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    for (let index = last; index < start; index += 1) {
      chars.push(visible[index] ?? "");
      map.push(index);
    }
    chars.push(" ");
    map.push(start);
    last = end;
  }
  for (let index = last; index < visible.length; index += 1) {
    chars.push(visible[index] ?? "");
    map.push(index);
  }
  return { text: chars.join(""), map };
}

const DEV_NEEDLE = "import.meta.env.DEV";

/** A markup hit whose value, or a dev-only spread around it, is not shipped. */
function markupGuarded(original: string, index: number): boolean {
  if (index < 0) return false;
  if (valueExpressionGuarded(original, index)) return true;
  return keptByEnclosingDev(original, index);
}

function valueExpressionGuarded(original: string, index: number): boolean {
  const slice = original.slice(index);
  const name = /^[^\s=/>]+/.exec(slice);
  if (name === null) return false;
  let cursor = name[0].length;
  while (cursor < slice.length && /\s/.test(slice[cursor] ?? "")) cursor += 1;
  if (slice[cursor] !== "=") return false;
  cursor += 1;
  while (cursor < slice.length && /\s/.test(slice[cursor] ?? "")) cursor += 1;
  if (slice[cursor] !== "{") return false;
  const end = endBrace(slice, cursor);
  return findDevOperator(slice.slice(cursor, end)) !== null;
}

function keptByEnclosingDev(original: string, index: number): boolean {
  let depth = 0;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const ch = original[cursor];
    if (ch === "}") depth += 1;
    else if (ch === "{") {
      if (depth === 0) {
        const end = endBrace(original, cursor);
        if (end > index && devKeeps(original.slice(cursor, end), index - cursor)) return true;
      } else {
        depth -= 1;
      }
    }
  }
  return false;
}

/** True when `relative` sits in the kept branch of `import.meta.env.DEV ?` or `&&`. */
function devKeeps(expr: string, relative: number): boolean {
  const found = findDevOperator(expr);
  if (found === null || relative < found.after) return false;
  return inKeptBranch(expr.slice(found.after, relative));
}

function findDevOperator(expr: string): { after: number } | null {
  let quote: string | null = null;
  for (let index = 0; index < expr.length; index += 1) {
    const ch = expr[index] ?? "";
    if (quote !== null) {
      if (ch === "\\") {
        index += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (!expr.startsWith(DEV_NEEDLE, index)) continue;
    let cursor = index + DEV_NEEDLE.length;
    while (cursor < expr.length && /\s/.test(expr[cursor] ?? "")) cursor += 1;
    const op = expr[cursor];
    if (op === "?") return { after: cursor + 1 };
    if (op === "&" && expr[cursor + 1] === "&") return { after: cursor + 2 };
  }
  return null;
}

function inKeptBranch(between: string): boolean {
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < between.length; index += 1) {
    const ch = between[index] ?? "";
    if (quote !== null) {
      if (ch === "\\") {
        index += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{" || ch === "(") depth += 1;
    else if (ch === "}" || ch === ")") {
      depth -= 1;
      if (depth < 0) return false;
    } else if ((ch === ":" || ch === ";") && depth === 0) return false;
  }
  return true;
}

function endBrace(text: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let index = open; index < text.length; index += 1) {
    const ch = text[index] ?? "";
    if (quote !== null) {
      if (ch === "\\") {
        index += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return text.length;
}

function rawAttribute(original: string, index: number, length: number): string {
  const slice = original.slice(Math.max(0, index));
  const name = /^[^\s=/>]+/.exec(slice);
  if (name === null) return rawAround(original, index, length);
  let cursor = name[0].length;
  while (cursor < slice.length && /\s/.test(slice[cursor] ?? "")) cursor += 1;
  if (slice[cursor] !== "=") return rawAround(original, index, length);
  cursor += 1;
  while (cursor < slice.length && /\s/.test(slice[cursor] ?? "")) cursor += 1;
  const end = endOfValue(slice, cursor);
  return clip(slice.slice(0, end));
}

function endOfValue(text: string, start: number): number {
  const ch = text[start] ?? "";
  if (ch === "{") return endBrace(text, start);
  if (ch === "\"" || ch === "'") {
    for (let index = start + 1; index < text.length; index += 1) {
      if (text[index] === "\\") {
        index += 1;
        continue;
      }
      if (text[index] === ch) return index + 1;
    }
    return text.length;
  }
  const bare = /^[^\s>]+/.exec(text.slice(start));
  return start + (bare?.[0].length ?? 0);
}

function rawAround(original: string, index: number, length: number): string {
  const safe = Math.max(0, Math.min(index, original.length));
  let start = original.lastIndexOf("\n", Math.max(0, safe - 1)) + 1;
  let end = original.indexOf("\n", safe);
  if (end === -1) end = original.length;
  if (end - start > 180) {
    start = Math.max(start, safe - 60);
    end = Math.min(end, safe + Math.max(length, 80));
  }
  return clip(original.slice(start, end));
}

function lineNumber(original: string, index: number): number {
  let line = 1;
  const end = Math.max(0, Math.min(index, original.length));
  for (let cursor = 0; cursor < end; cursor += 1) {
    if (original[cursor] === "\n") line += 1;
  }
  return line;
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
      (left.line ?? 0) - (right.line ?? 0) ||
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
