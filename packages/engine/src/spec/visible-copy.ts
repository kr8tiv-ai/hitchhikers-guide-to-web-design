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
  if (!isDirectory(root)) return [];
  const hits: VisibleCopyHit[] = [];
  const seen = new Set<string>();
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
      const key = `${hit.file}\0${hit.patternId}\0${hit.snippet}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push(hit);
      if (hits.length >= HIT_CAP) return sortHits(hits);
    }
  }
  return sortHits(hits);
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
