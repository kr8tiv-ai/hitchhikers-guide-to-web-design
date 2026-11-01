/**
 * Document-head gate for built HTML.
 * Titles carry the derived site name. Meta descriptions are real sentences.
 * Narration and missing-fact lines use the visible-copy pattern list.
 * A prompt that does not write the layout or SEO data is not failed for the
 * head, unless it is QA or launch. Those prompts own every page's head, so
 * this check does not use a count baseline.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { promptRequiresFullVisibleCopy, VISIBLE_COPY_PATTERNS, type VisibleCopyPattern } from "./visible-copy.ts";

export type HeadIssueKind = "bare-title" | "duplicate-title" | "empty-description" | "bad-description";

export interface HeadIssue {
  file: string;
  kind: HeadIssueKind;
  detail: string;
  /** Set when a description matches a visible-copy pattern. */
  patternId?: string;
}

const ISSUE_CAP = 40;
const FILE_CAP = 2_000_000;

const KIND_ORDER: Record<HeadIssueKind, number> = {
  "bare-title": 0,
  "duplicate-title": 1,
  "empty-description": 2,
  "bad-description": 3,
};

/**
 * Layout shells and SEO data. Page and component files do not own the head.
 * Paths match the files the layout and SEO jobs write.
 */
const HEAD_SOURCE =
  /^(?:src\/layouts\/.+|src\/app\/(?:.+\/)?layout\.[jt]sx|src\/routes\/(?:.+\/)?\+layout\.svelte|src\/world\/(?:main|Shell)\.tsx|src\/data\/seo\.ts|src\/data\/seo\/.+)$/i;

export function isDocumentHeadSource(rel: string): boolean {
  const norm = rel.replace(/\\/g, "/").replace(/^\.\//, "");
  return HEAD_SOURCE.test(norm);
}

/**
 * QA and launch always. Otherwise only when an owned path is the layout or SEO data.
 * `ownedPaths` is the same list the visible-copy close uses: the Files line plus src files written.
 */
export function promptChecksDocumentHead(promptText: string, ownedPaths: readonly string[]): boolean {
  if (promptRequiresFullVisibleCopy(promptText, ownedPaths)) return true;
  return ownedPaths.some(isDocumentHeadSource);
}

export function scanDocumentHead(root: string, siteName: string): HeadIssue[] {
  if (!isDirectory(root)) return [];
  const name = siteName.trim() === "" ? "Site" : siteName.trim();
  const needle = name.toLowerCase();
  const pages: Array<{ file: string; title: string; description: string | null }> = [];
  for (const abs of htmlFiles(root)) {
    let html = "";
    try {
      if (statSync(abs).size > FILE_CAP) continue;
      html = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const prepared = stripNoise(html);
    const rel = path.relative(root, abs).split("\\").join("/");
    pages.push({
      file: rel,
      title: readTitle(prepared),
      description: readDescription(prepared),
    });
  }
  const byTitle = new Map<string, number>();
  for (const page of pages) {
    if (page.title === "") continue;
    byTitle.set(page.title, (byTitle.get(page.title) ?? 0) + 1);
  }
  const issues: HeadIssue[] = [];
  for (const page of pages) {
    const titled = page.title !== "" && page.title.toLowerCase().includes(needle);
    if (!titled) {
      issues.push({
        file: page.file,
        kind: "bare-title",
        detail: `title ${JSON.stringify(page.title)} does not include the site name ${JSON.stringify(name)}`,
      });
    }
    if (page.title !== "" && (byTitle.get(page.title) ?? 0) > 1) {
      issues.push({
        file: page.file,
        kind: "duplicate-title",
        detail: `duplicate title ${JSON.stringify(page.title)}`,
      });
    }
    if (page.description === null || page.description === "") {
      issues.push({ file: page.file, kind: "empty-description", detail: "meta description is empty" });
      continue;
    }
    const pattern = copyPattern(page.description);
    if (pattern === undefined) continue;
    issues.push({
      file: page.file,
      kind: "bad-description",
      patternId: pattern.id,
      detail: `meta description ${JSON.stringify(clip(page.description))}`,
    });
  }
  issues.sort(
    (left, right) => left.file.localeCompare(right.file) || KIND_ORDER[left.kind] - KIND_ORDER[right.kind] || left.detail.localeCompare(right.detail),
  );
  return issues;
}

export function formatDocumentHeadFailure(issues: readonly HeadIssue[]): string {
  if (issues.length === 0) return "";
  const lines = issues.slice(0, ISSUE_CAP).map((issue) => `dist/${issue.file}: ${issue.detail}`);
  if (issues.length > ISSUE_CAP) lines.push(`... and ${issues.length - ISSUE_CAP} more`);
  return `Head check failed.\n${lines.join("\n")}`;
}

function copyPattern(text: string): VisibleCopyPattern | undefined {
  for (const pattern of VISIBLE_COPY_PATTERNS) {
    if (pattern.scope !== "copy") continue;
    if (new RegExp(pattern.source, pattern.flags).test(text)) return pattern;
  }
  return undefined;
}

function readTitle(html: string): string {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (match === null) return "";
  return (match[1] ?? "").replace(/\s+/g, " ").trim();
}

function readDescription(html: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const name = attr(tag, "name");
    if (name === null || name.toLowerCase() !== "description") continue;
    return (attr(tag, "content") ?? "").replace(/\s+/g, " ").trim();
  }
  return null;
}

function attr(tag: string, name: string): string | null {
  const match = new RegExp(String.raw`\b${name}\s*=\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);
  if (match === null) return null;
  return match[1] ?? match[2] ?? "";
}

function stripNoise(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
}

function clip(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 180);
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
