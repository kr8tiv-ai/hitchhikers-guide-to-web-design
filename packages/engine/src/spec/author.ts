/**
 * Stage 2 of the site prompt package. Grok writes each body.
 * validatePackage gates the body before the file is written as ready.
 *
 * Package-level rules (phase coverage, review cadence, depends-on, stack
 * paths) need the whole skeleton, so a single entry is gated on the body
 * rules plus a missing CONTEXT.md anchor. The caller still runs
 * validatePackage on the finished package.
 *
 * Assumption: a CONTEXT.md anchor is a markdown heading slug. A missing
 * heading is a read-first-anchor error. It is not omitted from the request.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { think } from "../ai/think.ts";
import { estimateTokens } from "./context-doc.ts";
import {
  AUTHOR_BODY_SCHEMA,
  AUTHOR_EFFORT,
  AUTHOR_INSTRUCTIONS,
  AUTHOR_MODEL,
  AUTHOR_TASK,
  AUTHOR_TOKEN_BUDGET,
  type AuthoredBody,
} from "./author-schemas.ts";
import {
  inferSkeletonStack,
  registerInflight,
  retargetSkeleton,
} from "./framework-discussion.ts";
import { MOTION_BIND_SENTENCE, type SitePrompt, type SitePromptSkeleton } from "./site-prompts.ts";
import { SITE_RULES } from "./site-rules.ts";
import { validatePackage, type ValidationReport } from "./site-validate.ts";
import type { StackPick } from "./stack.ts";

export interface AuthorContext {
  contextMd: string;
  packsDir: string;
  goldenDir: string;
  templatesDir: string;
  projectDir: string;
}

export interface AuthorResult {
  written: string[];
  needsHuman: string[];
}

const PACKAGE_RULES = new Set([
  "phase-coverage",
  "review-cadence",
  "depends-forward",
  "stack-paths",
]);

const MOTION_GOLDEN = new Set([
  "motion",
  "lenis",
  "reveals",
  "split-text",
  "scroll-video",
  "transitions",
  "three",
  "shader",
  "theatre",
  "anime",
  "css-scroll",
  "vanilla",
  "elevate-motion",
]);

const LIBRARY_FILE: Record<string, string> = {
  lenis: "lenis",
  three: "three",
  ogl: "shader",
  motion: "motion",
  anime: "anime",
  theatre: "theatre",
  "css-scroll": "css-scroll",
  vanilla: "vanilla",
};

export class AuthorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorError";
  }
}

interface RequestParts {
  input: string;
  anchors: string[];
  goldenName: string;
}

interface RunState {
  stopped: boolean;
  restartPick: StackPick | null;
}

export function goldenName(entry: SitePromptSkeleton): string {
  if (entry.kind === "once-over") return "once-over";
  const title = entry.title.toLowerCase();
  if (/\bfix list\b/.test(title) || /\bfix prompt\b/.test(title)) return "fix";
  if (entry.library === "gsap") {
    if (title.includes("split")) return "split-text";
    if (title.includes("scrub") || title.includes("scroll video") || title.includes("scroll-scrub")) {
      return "scroll-video";
    }
    if (title.includes("transition")) return "transitions";
    if (title.includes("reveal")) return "reveals";
    return "motion";
  }
  if (entry.library !== undefined) {
    const named = LIBRARY_FILE[entry.library];
    if (named !== undefined) return named;
  }
  const req = entry.requirements[0] ?? "";
  if (req === "REQ-SCAFFOLD") return "setup";
  if (req === "REQ-FONTS") return "fonts";
  if (req === "REQ-LAYOUT") return "layout";
  if (req === "REQ-TOKENS" || req === "REQ-LOGO" || req === "REQ-VOICE") return "tokens";
  if (req === "REQ-ROUTES") return "routes";
  if (req === "REQ-SECTION-REGISTRY" || req === "REQ-REQUIREMENTS" || req.startsWith("REQ-PAGE-")) {
    return "structure";
  }
  if (req === "REQ-NAV") return "nav";
  if (req.startsWith("REQ-STRUCT-")) {
    if (req.endsWith("-hero") || /\bhero\b/.test(title)) return "hero";
    return "section";
  }
  if (req.startsWith("REQ-COPY-")) return "page";
  if (req.startsWith("REQ-IMAGE-")) return "imagery";
  if (req.startsWith("REQ-FEAT-")) return /form/.test(title) ? "forms" : "feature";
  if (req.startsWith("REQ-INT-")) return "integrations";
  if (req === "REQ-PERF") return "media";
  if (req.startsWith("REQ-SEO-")) return /blog/.test(title) ? "blog" : "seo";
  if (req === "REQ-CREDITS") return "credits";
  if (req === "REQ-MOTION-CLOCK") return "motion";
  if (req.startsWith("REQ-GATE-LIGHTHOUSE") || req.startsWith("REQ-GATE-CWV")) return "lighthouse";
  if (req.startsWith("REQ-GATE-")) return "qa";
  if (req === "REQ-JURY") return "jury";
  if (req === "REQ-ELEVATE-TYPE") return "elevate-type";
  if (req === "REQ-ELEVATE-MOTION") return "elevate-motion";
  if (req === "REQ-ELEVATE-IMAGERY") return "elevate-imagery";
  if (req === "REQ-ELEVATE-COPY") return "elevate-copy";
  if (req.startsWith("REQ-ELEVATE")) return "elevate";
  if (req === "REQ-DEPLOY" || req === "REQ-PRELAUNCH" || req === "REQ-POST-DEPLOY") return "deploy";
  if (req === "REQ-HANDOFF" || req === "REQ-LAUNCH") return "handoff";
  return "section";
}

export function pickGolden(entry: SitePromptSkeleton, goldenDir: string): string {
  return path.join(goldenDir, `${goldenName(entry)}.md`);
}

export function anchorsFor(name: string): string[] {
  if (MOTION_GOLDEN.has(name)) return ["motion", "sections"];
  if (name === "tokens" || name === "hero" || name === "page" || name === "elevate-copy") {
    return ["brand", "voice"];
  }
  if (name === "setup" || name === "fonts" || name === "layout" || name === "deploy") return ["stack"];
  return ["sections"];
}

export function buildAuthorRequest(
  entry: SitePromptSkeleton,
  ctx: AuthorContext,
  options?: { stack?: StackPick | null; templateList?: string },
): RequestParts {
  const name = goldenName(entry);
  const goldenPath = path.join(ctx.goldenDir, `${name}.md`);
  if (!statExists(goldenPath)) {
    throw new AuthorError(`Golden template is missing: ${goldenPath}`);
  }
  const golden = readFileSync(goldenPath, "utf8");
  const anchors = anchorsFor(name);
  const stack = options?.stack ?? null;
  const templateList = options?.templateList ?? listTemplates(ctx.templatesDir);
  const packs = new Map<string, string>();
  for (const pack of packNames(name, stack)) {
    packs.set(pack, readPack(ctx.packsDir, pack));
  }
  const input = fitRequest(entry, golden, anchors, ctx.contextMd, packs, templateList);
  return { input, anchors, goldenName: name };
}

export async function authorPackage(
  skeleton: readonly SitePromptSkeleton[],
  ctx: AuthorContext,
  deps: { think: typeof think },
): Promise<AuthorResult> {
  return runPackage(skeleton, ctx, deps, 0);
}

async function runPackage(
  skeleton: readonly SitePromptSkeleton[],
  ctx: AuthorContext,
  deps: { think: typeof think },
  depth: number,
): Promise<AuthorResult> {
  if (depth > 3) {
    throw new AuthorError("Framework override did not settle after 3 restarts.");
  }
  const state: RunState = { stopped: false, restartPick: null };
  const sessionId = Symbol("author");
  registerInflight({
    id: sessionId,
    stop(pick) {
      state.stopped = true;
      state.restartPick = pick;
    },
  });
  const written: string[] = [];
  const needsHuman: string[] = [];
  try {
    const promptsDir = path.join(ctx.projectDir, ".hitchhiker", "prompts");
    await clearOwned(promptsDir);
    let stack: StackPick | null = null;
    try {
      stack = inferSkeletonStack(skeleton);
    } catch {
      stack = null;
    }
    const templateList = listTemplates(ctx.templatesDir);
    const usedNames = new Set<string>();
    for (const entry of skeleton) {
      if (state.stopped) break;
      const request = buildAuthorRequest(entry, ctx, { stack, templateList });
      const outcome = await authorEntry(entry, ctx, deps, request, state);
      if (state.stopped) break;
      if (outcome.prompt === null) {
        needsHuman.push(entry.id);
        continue;
      }
      const fileName = uniqueName(entry, usedNames);
      const full = path.join(promptsDir, fileName);
      await mkdir(promptsDir, { recursive: true });
      await writeFile(full, renderPromptFile(outcome.prompt), "utf8");
      written.push(full);
    }
  } finally {
    registerInflight(null);
  }
  if (state.restartPick !== null) {
    return runPackage(retargetSkeleton(skeleton, state.restartPick), ctx, deps, depth + 1);
  }
  return { written, needsHuman };
}

async function authorEntry(
  entry: SitePromptSkeleton,
  ctx: AuthorContext,
  deps: { think: typeof think },
  request: RequestParts,
  state: RunState,
): Promise<{ prompt: SitePrompt | null }> {
  const first = await deps.think<AuthoredBody>({
    task: AUTHOR_TASK,
    model: AUTHOR_MODEL,
    effort: AUTHOR_EFFORT,
    schema: AUTHOR_BODY_SCHEMA,
    input: request.input,
  });
  if (state.stopped) return { prompt: null };
  const firstBody = readBody(first.value);
  const firstPrompt = assemble(entry, firstBody);
  const firstReport = entryReport(firstPrompt, ctx.contextMd, request.anchors);
  if (firstReport.ok && firstPrompt !== null) return { prompt: firstPrompt };

  const repair = await deps.think<AuthoredBody>({
    task: AUTHOR_TASK,
    model: AUTHOR_MODEL,
    effort: AUTHOR_EFFORT,
    schema: AUTHOR_BODY_SCHEMA,
    input: repairInput(request.input, firstReport.errors, firstBody),
  });
  if (state.stopped) return { prompt: null };
  const secondBody = readBody(repair.value);
  const secondPrompt = assemble(entry, secondBody);
  const secondReport = entryReport(secondPrompt, ctx.contextMd, request.anchors);
  if (secondReport.ok && secondPrompt !== null) return { prompt: secondPrompt };
  return { prompt: null };
}

function readBody(value: unknown): string {
  if (typeof value !== "object" || value === null || !("body" in value)) return "";
  const body = value.body;
  if (typeof body !== "string") return "";
  return body.trim();
}

function assemble(entry: SitePromptSkeleton, body: string): SitePrompt | null {
  if (body.length === 0) return null;
  const prompt: SitePrompt = {
    id: entry.id,
    phase: entry.phase,
    slice: entry.slice,
    title: entry.title,
    tier: entry.tier,
    effort: entry.effort,
    model: entry.model,
    dependsOn: [...entry.dependsOn],
    filesModified: [...entry.filesModified],
    requirements: [...entry.requirements],
    protected: [...entry.protected],
    reviewAfter: entry.reviewAfter,
    maxTurns: entry.maxTurns,
    kind: entry.kind,
    rules: SITE_RULES,
    body,
  };
  if (entry.library !== undefined) prompt.library = entry.library;
  return prompt;
}

export function entryReport(
  prompt: SitePrompt | null,
  contextMd: string,
  anchors: readonly string[],
): ValidationReport {
  if (prompt === null) {
    return {
      ok: false,
      errors: [{ id: "entry", rule: "frontmatter-complete", detail: "The body was empty." }],
    };
  }
  const report = validatePackage([prompt]);
  const errors = report.errors.filter((error) => !PACKAGE_RULES.has(error.rule));
  const known = headingIds(contextMd);
  for (const anchor of anchors) {
    if (!known.has(anchor)) {
      errors.push({
        id: prompt.id,
        rule: "read-first-anchor",
        detail: `CONTEXT.md anchor #${anchor} is missing.`,
      });
    }
  }
  for (const match of prompt.body.matchAll(/@\.hitchhiker\/CONTEXT\.md#([A-Za-z0-9][A-Za-z0-9_-]*)/g)) {
    const anchor = match[1];
    if (anchor !== undefined && !known.has(anchor)) {
      errors.push({
        id: prompt.id,
        rule: "read-first-anchor",
        detail: `CONTEXT.md anchor #${anchor} is missing.`,
      });
    }
  }
  const seen = new Set<string>();
  const unique = errors.filter((error) => {
    const key = `${error.rule}:${error.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { ok: unique.length === 0, errors: unique };
}

function repairInput(
  input: string,
  errors: ValidationReport["errors"],
  previous: string,
): string {
  return [
    input,
    "",
    "The previous body failed validation. Return one JSON object with a body field.",
    "Fix every error. Do not drop a missing CONTEXT.md anchor.",
    "Errors:",
    ...errors.map((error) => `- ${error.id} ${error.rule}: ${error.detail}`),
    "Previous body:",
    previous.length === 0 ? "(empty)" : previous,
  ].join("\n");
}

function fitRequest(
  entry: SitePromptSkeleton,
  golden: string,
  anchors: readonly string[],
  contextMd: string,
  packs: ReadonlyMap<string, string>,
  templateList: string,
): string {
  let packCap = 12_000;
  let templateCap = 8_000;
  let anchorCap = 8_000;
  let input = compose(entry, golden, anchors, contextMd, packs, templateList, packCap, templateCap, anchorCap);
  while (estimateTokens(input) > AUTHOR_TOKEN_BUDGET && packCap > 0) {
    packCap = Math.floor(packCap / 2);
    input = compose(entry, golden, anchors, contextMd, packs, templateList, packCap, templateCap, anchorCap);
  }
  while (estimateTokens(input) > AUTHOR_TOKEN_BUDGET && templateCap > 0) {
    templateCap = Math.floor(templateCap / 2);
    input = compose(entry, golden, anchors, contextMd, packs, templateList, packCap, templateCap, anchorCap);
  }
  while (estimateTokens(input) > AUTHOR_TOKEN_BUDGET && anchorCap > 200) {
    anchorCap = Math.floor(anchorCap / 2);
    input = compose(entry, golden, anchors, contextMd, packs, templateList, packCap, templateCap, anchorCap);
  }
  if (estimateTokens(input) > AUTHOR_TOKEN_BUDGET) {
    throw new AuthorError(
      `Author request is still over ${AUTHOR_TOKEN_BUDGET} tokens after trimming pack excerpts.`,
    );
  }
  return input;
}

function compose(
  entry: SitePromptSkeleton,
  golden: string,
  anchors: readonly string[],
  contextMd: string,
  packs: ReadonlyMap<string, string>,
  templateList: string,
  packCap: number,
  templateCap: number,
  anchorCap: number,
): string {
  const libraryLine =
    entry.library === undefined
      ? "This entry sets no motion library."
      : `This entry sets library ${entry.library}. Include ${MOTION_BIND_SENTENCE}`;
  return [
    AUTHOR_INSTRUCTIONS,
    "",
    libraryLine,
    "",
    "SKELETON_JSON:",
    JSON.stringify(entry),
    "END_SKELETON",
    "",
    "GOLDEN_TEMPLATE:",
    golden.trim(),
    "END_GOLDEN",
    "",
    "ANCHORS:",
    anchorBlocks(anchors, contextMd, anchorCap),
    "END_ANCHORS",
    "",
    "PACK_EXCERPTS:",
    packBlocks(packs, packCap),
    "END_PACKS",
    "",
    "TEMPLATE_PATHS:",
    clip(templateList, templateCap, "[template list trimmed]"),
    "END_TEMPLATES",
  ].join("\n");
}

function anchorBlocks(anchors: readonly string[], contextMd: string, cap: number): string {
  const each = anchors.length === 0 ? cap : Math.max(200, Math.floor(cap / anchors.length));
  return anchors
    .map((anchor) => {
      const body = sectionById(contextMd, anchor);
      if (body === null) {
        return [`#${anchor}`, `MISSING ANCHOR #${anchor}`, "Do not drop this anchor."].join("\n");
      }
      return [`#${anchor}`, clip(body, each, "[anchor excerpt trimmed]")].join("\n");
    })
    .join("\n\n");
}

function packBlocks(packs: ReadonlyMap<string, string>, cap: number): string {
  if (cap <= 0 || packs.size === 0) return "";
  const each = Math.max(0, Math.floor(cap / packs.size));
  if (each === 0) return "";
  const blocks: string[] = [];
  for (const [name, text] of packs) {
    if (text.trim().length === 0) continue;
    blocks.push(`# ${name}\n${clip(text, each, "[excerpt trimmed]")}`);
  }
  return blocks.join("\n\n");
}

function clip(text: string, cap: number, note: string): string {
  if (cap <= 0) return "";
  if (text.length <= cap) return text;
  return `${text.slice(0, cap)}\n${note}`;
}

function packNames(name: string, stack: StackPick | null): string[] {
  const names = ["anti-slop"];
  if (MOTION_GOLDEN.has(name)) names.push("motion");
  if (name === "seo" || name === "blog") names.push("seo");
  if (name === "page" || name === "hero" || name === "elevate-copy") names.push("copywriting");
  if (name === "tokens" || name === "fonts" || name === "hero") names.push("typography", "color");
  if (name === "forms" || name === "feature") names.push("ux-conversion");
  if (name === "qa" || name === "lighthouse" || name === "nav") names.push("a11y");
  if (name.startsWith("elevate") || name === "jury" || name === "fix") names.push("award-sites");
  if (name === "setup" || name === "layout" || name === "structure" || name === "routes") {
    if (stack === "astro") names.push("stack-astro");
    else if (stack === "next") names.push("stack-next");
    else if (stack === "vite-react") names.push("stack-vite-react");
  }
  return [...new Set(names)];
}

function readPack(packsDir: string, name: string): string {
  const file = path.join(packsDir, name, "SKILL.md");
  if (!statExists(file)) return "";
  return readFileSync(file, "utf8").replace(/^---[\s\S]*?---\s*/, "");
}

function listTemplates(templatesDir: string): string {
  if (!statExists(templatesDir)) return "";
  const files: string[] = [];
  walk(templatesDir, templatesDir, files);
  files.sort();
  return files.join("\n");
}

function walk(root: string, dir: string, into: string[]): void {
  let entries: ReadonlyArray<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    if (entry.name === "pnpm-lock.yaml" || entry.name.endsWith(".tsbuildinfo")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(root, full, into);
    } else if (entry.isFile()) {
      into.push(path.relative(root, full).split(path.sep).join("/"));
    }
  }
}

function headingIds(markdown: string): Set<string> {
  const ids = new Set<string>();
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^(#{1,6})[ \t]+(.+?)\s*$/.exec(line);
    const text = match?.[2];
    if (text === undefined) continue;
    const id = headingSlug(text);
    if (id.length > 0) ids.add(id);
  }
  return ids;
}

function sectionById(markdown: string, id: string): string | null {
  const lines = markdown.split(/\r?\n/);
  const heads: Array<{ level: number; id: string; line: number }> = [];
  lines.forEach((line, index) => {
    const match = /^(#{1,6})[ \t]+(.+?)\s*$/.exec(line);
    const marks = match?.[1];
    const text = match?.[2];
    if (marks === undefined || text === undefined) return;
    heads.push({ level: marks.length, id: headingSlug(text), line: index });
  });
  const found = heads.find((head) => head.id === id);
  if (found === undefined) return null;
  let end = lines.length;
  for (const head of heads) {
    if (head.line > found.line && head.level <= found.level) {
      end = head.line;
      break;
    }
  }
  return lines.slice(found.line, end).join("\n").trim();
}

function headingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function renderPromptFile(prompt: SitePrompt): string {
  const lines = [
    "---",
    `id: ${quote(prompt.id)}`,
    `phase: ${prompt.phase}`,
    `slice: ${quote(prompt.slice)}`,
    `title: ${quote(prompt.title)}`,
    `tier: ${quote(prompt.tier)}`,
    `effort: ${prompt.effort}`,
    `model: ${quote(prompt.model)}`,
    `depends_on: [${prompt.dependsOn.map(quote).join(", ")}]`,
    `files_modified: [${prompt.filesModified.map(quote).join(", ")}]`,
    `requirements: [${prompt.requirements.map(quote).join(", ")}]`,
    `protected: [${prompt.protected.map(quote).join(", ")}]`,
    `review_after: ${prompt.reviewAfter}`,
    `max_turns: ${prompt.maxTurns}`,
    `kind: ${prompt.kind}`,
  ];
  if (prompt.library !== undefined) lines.push(`library: ${prompt.library}`);
  lines.push("---", "<rules>", prompt.rules, "</rules>", prompt.body.trim(), "");
  return lines.join("\n");
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function uniqueName(entry: SitePromptSkeleton, used: Set<string>): string {
  const slug = slugTitle(entry.title);
  let name = `${entry.id}-${slug}.md`;
  let n = 2;
  while (used.has(name)) {
    name = `${entry.id}-${slug}-${n}.md`;
    n += 1;
  }
  used.add(name);
  return name;
}

function slugTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug.length > 0 ? slug : "prompt";
}

async function clearOwned(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  const names = await readdir(dir);
  await Promise.all(
    names.map(async (name) => {
      if (/^\d{3}-.+\.md$/.test(name)) {
        await rm(path.join(dir, name), { force: true });
      }
    }),
  );
}

function statExists(file: string): boolean {
  try {
    return statSync(file).isFile() || statSync(file).isDirectory();
  } catch {
    return false;
  }
}
