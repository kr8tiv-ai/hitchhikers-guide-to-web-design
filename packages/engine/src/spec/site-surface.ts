/**
 * Placeholder-contact and repeated-sentence gates for built HTML.
 * Visible text is scanned, and so are href, action, and data-* attributes.
 * Comments, scripts, styles, and non-HTML files are ignored.
 * A sentence of 12 or more words may appear twice on a page. That is the
 * footer disclaimer plus one line beside the inquiry form. A third copy fails.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export interface SurfaceHit {
  file: string;
  detail: string;
}

const SURFACE_CAP = 40;
const FILE_CAP = 2_000_000;
const SENTENCE_WORDS = 12;
const REPEAT_LIMIT = 2;
const CLIP = 180;

const RESERVED_PATTERNS: readonly RegExp[] = [
  /(?:^|[^A-Za-z0-9])((?:[A-Za-z0-9._%+-]+@)?(?:[A-Za-z0-9-]+\.)*example\.(?:com|org))\b/gi,
  /(?:^|[^A-Za-z0-9.])([A-Za-z0-9-]+\.(?:example|test|invalid))\b/gi,
  /(?:^|[^0-9])(555-\d+)\b/gi,
];

const CONTACT_ATTR = /\b(href|action|data-[\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;

export function scanPlaceholderContacts(root: string): SurfaceHit[] {
  return scanHtml(root, placeholderHits);
}

export function scanRepeatedSentences(root: string): SurfaceHit[] {
  return scanHtml(root, repetitionHits);
}

export function formatPlaceholderContactFailure(hits: readonly SurfaceHit[]): string {
  return formatSurfaceFailure("Placeholder contact failed.", hits);
}

export function formatRepeatedSentenceFailure(hits: readonly SurfaceHit[]): string {
  return formatSurfaceFailure("Repeated sentence failed.", hits);
}

function formatSurfaceFailure(label: string, hits: readonly SurfaceHit[]): string {
  if (hits.length === 0) return "";
  const ordered = sortHits(hits);
  const lines = ordered.slice(0, SURFACE_CAP).map((hit) => `dist/${hit.file}: ${hit.detail}`);
  if (ordered.length > SURFACE_CAP) lines.push(`... and ${ordered.length - SURFACE_CAP} more`);
  return `${label}\n${lines.join("\n")}`;
}

function placeholderHits(file: string, html: string): SurfaceHit[] {
  const prepared = stripNoise(html);
  const hits: SurfaceHit[] = [];
  for (const attr of contactAttributes(prepared)) {
    if (reservedTokens(attr.value).length === 0) continue;
    hits.push({ file, detail: clip(attr.shown) });
  }
  const masked = maskTags(prepared);
  for (const token of reservedTokens(masked)) {
    hits.push({ file, detail: clipAround(masked, token.index, token.token.length) });
  }
  return hits;
}

function repetitionHits(file: string, html: string): SurfaceHit[] {
  const counts = new Map<string, { count: number; sentence: string }>();
  for (const sentence of visibleSentences(html)) {
    const key = sentenceKey(sentence);
    if (wordCount(key) < SENTENCE_WORDS) continue;
    const row = counts.get(key);
    if (row === undefined) counts.set(key, { count: 1, sentence });
    else row.count += 1;
  }
  const hits: SurfaceHit[] = [];
  for (const row of counts.values()) {
    if (row.count <= REPEAT_LIMIT) continue;
    hits.push({ file, detail: clip(row.sentence) });
  }
  return hits;
}

function visibleSentences(html: string): string[] {
  const blocked = stripNoise(html)
    .replace(/<br\b[^>]*>/gi, ". ")
    .replace(
      /<\/(?:p|li|h[1-6]|div|section|article|footer|header|figcaption|blockquote|td|th|dd|dt|tr|title|head|body)\b[^>]*>/gi,
      ". ",
    );
  const text = blocked.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (text === "") return [];
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part !== "");
}

function sentenceKey(sentence: string): string {
  return sentence.replace(/[.!?]+$/g, "").replace(/\s+/g, " ").trim();
}

function wordCount(sentence: string): number {
  return sentence.split(/\s+/).filter((word) => /[0-9A-Za-z]/.test(word)).length;
}

interface ReservedToken {
  index: number;
  token: string;
}

function reservedTokens(value: string): ReservedToken[] {
  const found: ReservedToken[] = [];
  for (const pattern of RESERVED_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    for (const match of value.matchAll(regex)) {
      const token = match[1];
      if (token === undefined || match.index === undefined || match[0] === undefined) continue;
      found.push({ index: match.index + (match[0].length - token.length), token });
    }
  }
  found.sort((left, right) => left.index - right.index || left.token.localeCompare(right.token));
  const kept: ReservedToken[] = [];
  let end = -1;
  for (const hit of found) {
    if (hit.index < end) continue;
    kept.push(hit);
    end = hit.index + hit.token.length;
  }
  return kept;
}

function contactAttributes(html: string): Array<{ shown: string; value: string }> {
  const found: Array<{ shown: string; value: string }> = [];
  const regex = new RegExp(CONTACT_ATTR.source, CONTACT_ATTR.flags);
  for (const match of html.matchAll(regex)) {
    const name = match[1] ?? "";
    const quoted = match[2] !== undefined ? `"${match[2]}"` : match[3] !== undefined ? `'${match[3]}'` : "";
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (name === "" || value === "") continue;
    const shown = quoted === "" ? `${name}=${value}` : `${name}=${quoted}`;
    found.push({ shown, value });
  }
  return found;
}

function scanHtml(root: string, read: (file: string, html: string) => SurfaceHit[]): SurfaceHit[] {
  if (!isDirectory(root)) return [];
  const hits: SurfaceHit[] = [];
  const seen = new Set<string>();
  for (const abs of htmlFiles(root)) {
    let html = "";
    try {
      if (statSync(abs).size > FILE_CAP) continue;
      html = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const rel = path.relative(root, abs).split("\\").join("/");
    for (const hit of read(rel, html)) {
      const key = `${hit.file}\0${hit.detail}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push(hit);
    }
  }
  return sortHits(hits);
}

function stripNoise(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
}

function maskTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ");
}

function clipAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 48);
  const end = Math.min(text.length, index + Math.max(length, 80));
  return clip(text.slice(start, end));
}

function clip(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, CLIP);
}

function sortHits(hits: readonly SurfaceHit[]): SurfaceHit[] {
  return [...hits].sort((left, right) => left.file.localeCompare(right.file) || left.detail.localeCompare(right.detail));
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
