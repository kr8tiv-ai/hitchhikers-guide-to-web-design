import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const readmePath = path.join(repoRoot, "README.md");
const fixturePath = path.join(here, "fixtures", "broken-readme.md");

export type ReadmeLinkProblem = {
  kind: "missing-path" | "missing-anchor";
  target: string;
};

const SKIP_SCHEME = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * GitHub heading slug: lowercase, punctuation stripped, spaces to hyphens.
 * Hyphens stay. The first duplicate is unsuffixed. Later copies are -1, -2.
 */
export function githubSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

function withoutFences(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];
  let fenceChar: "`" | "~" | null = null;
  let fenceLen = 0;
  for (const line of lines) {
    const marker = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
    const ticks = marker?.[2];
    const char = ticks?.[0];
    if (marker && ticks && (char === "`" || char === "~")) {
      const rest = marker[3] ?? "";
      if (fenceChar === null) {
        fenceChar = char;
        fenceLen = ticks.length;
        out.push("");
        continue;
      }
      if (char === fenceChar && ticks.length >= fenceLen && rest.trim() === "") {
        fenceChar = null;
        fenceLen = 0;
        out.push("");
        continue;
      }
    }
    out.push(fenceChar === null ? line : "");
  }
  return out.join("\n");
}

function headingText(raw: string): string {
  return raw
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_]/g, "")
    .replace(/\s+#+\s*$/, "")
    .trim();
}

/** ATX headings outside fenced code, including a heading in a blockquote. */
export function headingSlugs(markdown: string): Set<string> {
  const counts = new Map<string, number>();
  const slugs = new Set<string>();
  for (const line of withoutFences(markdown).split("\n")) {
    const match = /^(?:>\s*)*(#{1,6})(?!#)\s+(.*)$/.exec(line);
    const raw = match?.[2];
    if (!raw) continue;
    const base = githubSlug(headingText(raw));
    if (base === "") continue;
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    slugs.add(seen === 0 ? base : `${base}-${seen}`);
  }
  return slugs;
}

function anchorSlug(anchor: string): string {
  let decoded = anchor.trim();
  try {
    decoded = decodeURIComponent(anchor.replaceAll("+", "%20")).trim();
  } catch {
    decoded = anchor.trim();
  }
  return githubSlug(decoded);
}

function destinations(markdown: string): string[] {
  const text = withoutFences(markdown);
  const found: string[] = [];
  for (const match of text.matchAll(/<(?:img|a)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const value = match[1];
    if (value) found.push(value);
  }
  let cursor = 0;
  while (cursor < text.length) {
    const close = text.indexOf("](", cursor);
    if (close < 0) break;
    const start = close + 2;
    if (text[start] === "<") {
      const end = text.indexOf(">", start + 1);
      if (end < 0) break;
      found.push(text.slice(start + 1, end).trim());
      const after = text.indexOf(")", end);
      cursor = after < 0 ? end + 1 : after + 1;
      continue;
    }
    const end = text.indexOf(")", start);
    if (end < 0) break;
    found.push(text.slice(start, end).trim());
    cursor = end + 1;
  }
  return found;
}

function pathAndAnchor(raw: string): { pathPart: string; anchor: string } | null {
  let dest = raw.trim();
  if (dest.startsWith("<") && dest.endsWith(">")) dest = dest.slice(1, -1).trim();
  const titled = /^(\S+)\s+(?:"[^"]*"|'[^']*')$/.exec(dest);
  if (titled?.[1]) dest = titled[1];
  if (dest === "" || SKIP_SCHEME.test(dest)) return null;
  const hash = dest.indexOf("#");
  const before = hash === -1 ? dest : dest.slice(0, hash);
  const anchor = hash === -1 ? "" : dest.slice(hash + 1);
  const pathPart = (before.split("?")[0] ?? before).trim();
  return { pathPart, anchor };
}

/**
 * Relative links and image paths must exist (file or directory).
 * Same-document anchors, and anchors on another markdown file, must match a heading slug.
 */
export function readmeLinkProblems(markdown: string, markdownFile: string): ReadmeLinkProblem[] {
  const problems: ReadmeLinkProblem[] = [];
  const slugs = headingSlugs(markdown);
  const baseDir = path.dirname(markdownFile);
  for (const raw of destinations(markdown)) {
    const parts = pathAndAnchor(raw);
    if (parts === null) continue;
    const { pathPart, anchor } = parts;
    if (pathPart === "") {
      if (anchor !== "" && !slugs.has(anchorSlug(anchor))) {
        problems.push({ kind: "missing-anchor", target: raw.trim() });
      }
      continue;
    }
    const resolved = path.resolve(baseDir, pathPart);
    if (!existsSync(resolved)) {
      problems.push({ kind: "missing-path", target: pathPart });
    }
    if (anchor === "") continue;
    const linked = resolved.toLowerCase().endsWith(".md") && existsSync(resolved)
      ? headingSlugs(readFileSync(resolved, "utf8"))
      : null;
    if (linked && !linked.has(anchorSlug(anchor))) {
      problems.push({ kind: "missing-anchor", target: raw.trim() });
    }
  }
  return problems;
}

test("README.md relative links and anchors resolve", () => {
  const markdown = readFileSync(readmePath, "utf8");
  assert.equal(path.basename(readmePath), "README.md");
  assert.deepEqual(readmeLinkProblems(markdown, readmePath), []);
});

test("a broken link and a broken anchor both fail", () => {
  const markdown = readFileSync(fixturePath, "utf8");
  const problems = readmeLinkProblems(markdown, fixturePath);
  assert.ok(problems.some((problem) => problem.kind === "missing-path" && problem.target === "docs/not-a-real-page.md"));
  assert.ok(problems.some((problem) => problem.kind === "missing-anchor" && problem.target === "#not-a-heading"));
  assert.equal(problems.some((problem) => problem.target === "#hello"), false);
});

test("duplicate headings are suffixed the GitHub way", () => {
  const markdown = "# Same\n\n# Same\n\n[first](#same)\n[second](#same-1)\n[missing](#same-2)\n";
  const problems = readmeLinkProblems(markdown, fixturePath);
  assert.deepEqual(problems, [{ kind: "missing-anchor", target: "#same-2" }]);
});

test("heading punctuation is stripped into the GitHub slug", () => {
  const markdown = "## What's in the repo today?\n\n[here](#whats-in-the-repo-today)\n";
  assert.deepEqual(readmeLinkProblems(markdown, fixturePath), []);
});

test("links inside fenced code are ignored", () => {
  const markdown = "# Ok\n\n```md\n[gone](missing.md)\n```\n\n[stay](#ok)\n";
  assert.deepEqual(readmeLinkProblems(markdown, fixturePath), []);
});
