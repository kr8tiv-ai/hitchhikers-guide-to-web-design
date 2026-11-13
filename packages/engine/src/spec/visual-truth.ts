/**
 * VISUAL-TRUTH.md and the matching lines in a page or section prompt.
 * Approved comps are the picture the build has to match. Words stay in HTML.
 * comps.ts calls the hook registered at the bottom of this file so the two
 * modules do not import each other.
 */

import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { planFromBrief } from "./brief-plan.ts";
import { listComps, setCompTruthHook, type CompFile, type CompPage, type CompSection } from "./comps.ts";
import { designSectionBody } from "./design-md-lint.ts";
import { listPrimaryPages } from "./page-renders.ts";
import { ownerPhotoFiles, sha256File } from "./reference-shots.ts";
import { visualTargetOf, type SitePromptSkeleton } from "./site-prompts.ts";

export const VISUAL_TRUTH_REL = "VISUAL-TRUTH.md";

export const COMP_OPEN_LINE = "Open these approved comps before you write code.";

/** Close checks read this prefix. The rest of the line is label, path, and sha256. */
export const COMP_MATCH_PREFIX = "Match this:";

const LIVE_TEXT =
  "Words are live HTML from the brief and the copy, never baked into images. A comp is never used as a page image. Owner photos fill the photo areas.";

const MATCH_RULE = "Match the composition, the spacing, the scale, the palette, and the photo treatment.";

const VIEW_ORDER = [
  { view: "desktop", label: "desktop" },
  { view: "mobile", label: "phone" },
  { view: "desktop-long", label: "long" },
] as const;

interface TruthRef {
  kind: "view" | "crop" | "motion";
  label: string;
  file: string;
  sha256: string;
}

type PromptPick = Pick<SitePromptSkeleton, "title" | "requirements" | "route">;

let writingTruth = false;

/** Writes VISUAL-TRUTH.md and refreshes comp lines in prompt files. Null when nothing is approved. */
export function writeVisualTruth(projectDir: string): string | null {
  if (writingTruth) return null;
  writingTruth = true;
  try {
    const doc = listComps(projectDir);
    const pages = orderedPages(projectDir, doc)
      .map((page) => ({ page, refs: refsFor(projectDir, page) }))
      .filter((row) => row.refs.some((ref) => ref.kind === "view" || ref.kind === "motion"));
    const abs = path.join(projectDir, VISUAL_TRUTH_REL);
    if (pages.length === 0) {
      if (existsSync(abs)) unlinkSync(abs);
      refreshPrompts(projectDir);
      return null;
    }
    writeIfChanged(abs, renderDocument(projectDir, pages));
    refreshPrompts(projectDir);
    return abs;
  } finally {
    writingTruth = false;
  }
}

/** Comp block for one prompt. Empty when the prompt owns no page, or nothing on that page is approved. */
export function visualTruthForPrompt(projectDir: string, prompt: PromptPick, brief = ""): string {
  const target = visualTargetOf(prompt);
  if (target === null) return "";
  const doc = listComps(projectDir);
  const route = target.route ?? routeForSection(doc, target.sectionId ?? "", brief, projectDir);
  if (route === null || route === "") return "";
  const page = doc.pages.find((item) => sameRoute(item.route, route));
  if (page === undefined) return "";
  const refs = refsFor(projectDir, page, target.sectionId);
  if (refs.length === 0) return "";
  return blockText(refs);
}

function blockText(refs: readonly TruthRef[]): string {
  const match = `${COMP_MATCH_PREFIX} ${refs.map((ref) => `${ref.label} ${ref.file} sha256:${ref.sha256}`).join("; ")}.`;
  return [COMP_OPEN_LINE, LIVE_TEXT, MATCH_RULE, match].join("\n");
}

function renderDocument(projectDir: string, pages: readonly { page: CompPage; refs: TruthRef[] }[]): string {
  const lines = [
    "# Visual truth",
    "",
    `${LIVE_TEXT} The build must match the composition, the spacing, the scale, the palette, and the photo treatment.`,
    "",
    "## 1. Approved comps and motion clips",
    "",
  ];
  for (const row of pages) {
    lines.push(`### ${pageHeading(projectDir, row.page.route)}`, "");
    for (const ref of row.refs) lines.push(`- ${ref.label}: ${ref.file} sha256:${ref.sha256}`);
    lines.push("");
  }
  lines.push(...ownerLines(projectDir), "");
  lines.push("## 2. DESIGN.md tokens and type", "", ...designLines(projectDir), "");
  lines.push(
    "## 3. Brief copy",
    "",
    "Read .hitchhiker/SITE-BRIEF.md for the brief copy.",
    "The words on the page are live HTML from that brief and the copy.",
    "",
  );
  return `${lines.join("\n").trimEnd()}\n`;
}

function orderedPages(projectDir: string, doc: CompFile): CompPage[] {
  const seen = new Set<string>();
  const rows: CompPage[] = [];
  for (const primary of listPrimaryPages(projectDir)) {
    const found = doc.pages.find((page) => sameRoute(page.route, primary.route));
    if (found === undefined) continue;
    rows.push(found);
    seen.add(normalizeRoute(found.route));
  }
  for (const page of doc.pages) {
    const key = normalizeRoute(page.route);
    if (seen.has(key)) continue;
    rows.push(page);
    seen.add(key);
  }
  return rows;
}

function refsFor(projectDir: string, page: CompPage, sectionId?: string): TruthRef[] {
  const refs = viewRefs(projectDir, page);
  const sections =
    sectionId === undefined ? page.sections : page.sections.filter((section) => section.id === sectionId);
  for (const section of sections) {
    const crop = cropRef(projectDir, section);
    if (crop !== null) refs.push(crop);
    const motion = motionRef(projectDir, section);
    if (motion !== null) refs.push(motion);
  }
  return refs;
}

function viewRefs(projectDir: string, page: CompPage): TruthRef[] {
  const refs: TruthRef[] = [];
  for (const item of VIEW_ORDER) {
    const record =
      item.view === "desktop" ? page.views.desktop : item.view === "mobile" ? page.views.mobile : page.views["desktop-long"];
    const approved = record?.approved;
    if (approved === undefined) continue;
    const rel = safeRel(approved.file);
    if (rel === null) continue;
    const sha = hashOf(projectDir, rel);
    if (sha === null || sha !== approved.sha256) continue;
    refs.push({ kind: "view", label: item.label, file: rel, sha256: sha });
  }
  return refs;
}

function cropRef(projectDir: string, section: CompSection): TruthRef | null {
  if (section.crop === undefined) return null;
  const rel = safeRel(section.crop);
  if (rel === null) return null;
  const sha = hashOf(projectDir, rel);
  if (sha === null) return null;
  return { kind: "crop", label: `section ${section.id}`, file: rel, sha256: sha };
}

function motionRef(projectDir: string, section: CompSection): TruthRef | null {
  const approved = section.motionApproved;
  if (approved === undefined) return null;
  const rel = safeRel(approved.file);
  if (rel === null) return null;
  const motion = section.motion?.replace(/\\/g, "/");
  if (motion !== undefined && motion !== rel) return null;
  const sha = hashOf(projectDir, rel);
  if (sha === null || sha !== approved.sha256) return null;
  return { kind: "motion", label: `motion ${section.id}`, file: rel, sha256: sha };
}

function routeForSection(doc: CompFile, sectionId: string, brief: string, projectDir: string): string | null {
  if (sectionId === "") return null;
  const texts = [brief];
  const siteBrief = path.join(projectDir, ".hitchhiker", "SITE-BRIEF.md");
  if (existsSync(siteBrief)) {
    try {
      texts.push(readFileSync(siteBrief, "utf8"));
    } catch {
      // A missing brief still leaves the comps.json section match below.
    }
  }
  for (const text of texts) {
    if (text.trim() === "") continue;
    const page = planFromBrief(text).pages.find((item) => item.sections.includes(sectionId));
    if (page !== undefined) return page.route;
  }
  const hits = doc.pages.filter((page) => page.sections.some((section) => section.id === sectionId));
  return hits.length === 1 ? hits[0]?.route ?? null : null;
}

function pageHeading(projectDir: string, route: string): string {
  const found = listPrimaryPages(projectDir).find((page) => sameRoute(page.route, route));
  return found === undefined ? route : `${found.title} at ${found.route}`;
}

function ownerLines(projectDir: string): string[] {
  const photos = ownerPhotoFiles(projectDir)
    .map((file) => safeRel(file))
    .filter((file): file is string => file !== null);
  if (photos.length === 0) return ["Owner photos: none yet."];
  return ["Owner photos:", ...photos.map((file) => `- ${file}`)];
}

function designLines(projectDir: string): string[] {
  const abs = path.join(projectDir, "DESIGN.md");
  if (!existsSync(abs)) return ["DESIGN.md is not written yet."];
  let markdown = "";
  try {
    markdown = readFileSync(abs, "utf8");
  } catch {
    return ["DESIGN.md is not written yet."];
  }
  const body = designSectionBody(markdown, "Typography");
  if (body === null || body.trim() === "") return ["DESIGN.md has no typography section yet."];
  const lines = body
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "")
    .slice(0, 12);
  return ["Read DESIGN.md for the tokens and the type scale.", ...lines];
}

function refreshPrompts(projectDir: string): void {
  const folder = path.join(projectDir, ".hitchhiker", "prompts");
  let names: string[] = [];
  try {
    names = readdirSync(folder);
  } catch {
    return;
  }
  for (const name of names) {
    if (!/^\d{3}\.md$/.test(name)) continue;
    const abs = path.join(folder, name);
    let original = "";
    try {
      original = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const next = refreshPromptComps(projectDir, original);
    if (next !== original) writeFileSync(abs, next, "utf8");
  }
}

function refreshPromptComps(projectDir: string, original: string): string {
  const parsed = parsedPrompt(original);
  if (parsed === null) return original;
  const block = visualTruthForPrompt(projectDir, parsed, parsed.brief);
  return spliceVisualTruth(original, block);
}

interface ParsedPrompt extends PromptPick {
  brief: string;
}

function parsedPrompt(original: string): ParsedPrompt | null {
  const text = original.replace(/\r\n/g, "\n");
  const title = /^# (.+)$/m.exec(text)?.[1]?.trim() ?? "";
  const task = /^## Task[ \t]*\n([\s\S]*?)(?=^## )/m.exec(text)?.[1] ?? "";
  const line = /^Requirements:[ \t]*(.+)$/m.exec(task)?.[1] ?? "";
  const requirements = line
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
  const route = /^Route:[ \t]*(\S+)[ \t]*$/m.exec(task)?.[1];
  const brief = /^## Site Brief[ \t]*\n([\s\S]*?)(?=^## )/m.exec(text)?.[1]?.trim() ?? "";
  if (title === "" && requirements.length === 0) return null;
  return { title, requirements, brief, ...(route === undefined ? {} : { route }) };
}

/**
 * Inserts, replaces, or removes ### Visual truth inside ## Design language.
 * A prompt with nothing to add is returned unchanged, including its newlines.
 */
function spliceVisualTruth(original: string, block: string): string {
  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  const text = original.replace(/\r\n/g, "\n");
  const trimmed = block.trim();
  if (trimmed === "" && !/^### Visual truth[ \t]*$/m.test(text)) return original;
  const span = designSpan(text);
  if (span === null) return original;
  const body = upsertVisual(text.slice(span.bodyStart, span.bodyEnd), trimmed, span.followed);
  let next = text.slice(0, span.bodyStart) + body + text.slice(span.bodyEnd);
  if (newline !== "\n") next = next.replace(/\n/g, newline);
  return next;
}

function designSpan(text: string): { bodyStart: number; bodyEnd: number; followed: boolean } | null {
  const headingAt = text.search(/^## Design language[ \t]*$/m);
  if (headingAt === -1) return null;
  const lineEnd = text.indexOf("\n", headingAt);
  if (lineEnd === -1) return null;
  const bodyStart = lineEnd + 1;
  const rest = text.slice(bodyStart);
  const gates = rest.search(/^### Gates[ \t]*$/m);
  const searchFrom = gates === -1 ? 0 : gates;
  const next = rest.slice(searchFrom).search(/^## /m);
  if (next === -1) return { bodyStart, bodyEnd: text.length, followed: false };
  return { bodyStart, bodyEnd: bodyStart + searchFrom + next, followed: true };
}

function upsertVisual(body: string, block: string, followed: boolean): string {
  const marker = body.search(/^### Visual truth[ \t]*$/m);
  const suffix = followed ? "\n\n" : "\n";
  if (block === "") {
    if (marker === -1) return body;
    return `${body.slice(0, marker).replace(/\n+$/, "")}${suffix}`;
  }
  const section = `### Visual truth\n\n${block}`;
  const before = (marker === -1 ? body : body.slice(0, marker)).replace(/\n+$/, "");
  return `${before}\n\n${section}${suffix}`;
}

function writeIfChanged(abs: string, body: string): void {
  const next = body.endsWith("\n") ? body : `${body}\n`;
  if (existsSync(abs)) {
    try {
      if (readFileSync(abs, "utf8") === next) return;
    } catch {
      // A file we cannot read is rewritten below.
    }
  }
  writeFileSync(abs, next, "utf8");
}

function hashOf(projectDir: string, rel: string): string | null {
  const abs = absInside(projectDir, rel);
  if (abs === null || !existsSync(abs)) return null;
  try {
    if (!statSync(abs).isFile()) return null;
    return sha256File(abs);
  } catch {
    return null;
  }
}

function absInside(projectDir: string, rel: string): string | null {
  const root = path.resolve(projectDir);
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) return null;
  return abs;
}

function safeRel(file: string): string | null {
  const rel = file.replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (rel === "" || rel.startsWith("/") || /^[a-zA-Z]:/.test(rel)) return null;
  if (rel.split("/").some((part) => part === ".." || part === "")) return null;
  return rel;
}

function normalizeRoute(route: string): string {
  let value = route.trim();
  if (value === "") return "/";
  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1 && value.endsWith("/")) value = value.slice(0, -1);
  return value;
}

function sameRoute(left: string, right: string): boolean {
  return normalizeRoute(left) === normalizeRoute(right);
}

setCompTruthHook((projectDir) => {
  try {
    writeVisualTruth(projectDir);
  } catch {
    // The approval is already stored. A truth file must not undo it.
  }
});
