/**
 * Sitemap, then a section wireframe, then DESIGN.md, then a direction, then pre-build checks.
 *
 * The direction pick stays after the style guide so approving the wireframe still
 * writes DESIGN.md. A pick after that regenerates DESIGN.md from the brand kit
 * and the picked pair, then clears the style-guide approval so the guide is
 * approved again. The picked pair wins over the kit pair. The palette stays the
 * kit: a direction hue does not replace it.
 *
 * A change edits the artefact and leaves the stage waiting. Only an approval
 * records an approval. A blank answer is not an approval. This module does not
 * call a model and does not start a build.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chooseDirection, onDirectionPicked, readDirectionDeal } from "../brand/directions.ts";
import type { BrandAnswer } from "../brand/kit-from-interview.ts";
import { planFromBrief, type BriefAnswer } from "./brief-plan.ts";
import { writeDesignMd, type DesignFontChoice } from "./design-outputs.ts";
import { runPrebuildChecks, type PrebuildReport } from "./prebuild-checks.ts";

export const SITEMAP_REL = ".hitchhiker/sitemap.md";
export const WIREFRAME_REL = ".hitchhiker/wireframe.md";
export const STAGE_APPROVALS_REL = ".hitchhiker/design-stages.json";

export type DesignStageName = "sitemap" | "wireframe" | "style-guide" | "direction" | "prebuild";

export interface DesignStageRequest {
  brief: string;
  answers?: readonly BrandAnswer[];
  approval?: { stage: DesignStageName; text: string };
  /** A requested edit. This never records an approval and is never stored as the artefact. */
  change?: { stage: DesignStageName; text: string };
  /** Set only when the person picked a dealt direction. Blank is not a choice. */
  direction?: { id: string; reason: string; at?: string };
  /** Set when the person acknowledges pre-build warnings. */
  acknowledge?: boolean;
}

export interface DesignStageResult {
  wrote: "sitemap" | "wireframe" | "style-guide" | "none";
  sitemap: boolean;
  wireframe: boolean;
  designMd: boolean;
}

interface StageApprovals {
  sitemap?: string;
  wireframe?: string;
  styleGuide?: string;
  direction?: string;
  prebuild?: string;
  warningsAck?: boolean;
}

interface SitemapPage {
  title: string;
  route: string;
  sections: string[];
  group: "primary" | "footer";
}

export interface DesignBuildGate {
  ok: boolean;
  reason: string;
  checks: PrebuildReport;
}

const FOOTER_TITLES = new Set(["privacy", "terms"]);

export function advanceDesignStages(projectDir: string, input: DesignStageRequest): DesignStageResult {
  const brief = input.brief;
  const answers = resolveAnswers(projectDir, input.answers);
  mkdirSync(path.join(projectDir, ".hitchhiker"), { recursive: true });
  recordChosenDirection(projectDir, input.direction);
  if (input.change !== undefined) return applyChange(projectDir, brief, answers, input.change.text);

  const sitemapPath = path.join(projectDir, SITEMAP_REL);
  const wireframePath = path.join(projectDir, WIREFRAME_REL);
  const designPath = path.join(projectDir, "DESIGN.md");
  const state = readApprovals(projectDir);

  if (!existsSync(sitemapPath)) {
    writeFileSync(sitemapPath, renderSitemap(brief, answers), "utf8");
    return result("sitemap", projectDir);
  }

  if (input.approval?.stage === "sitemap") recordText(state, "sitemap", input.approval.text);
  if (state.sitemap !== undefined) writeApprovals(projectDir, state);
  if (state.sitemap === undefined) return result("none", projectDir);

  if (!existsSync(wireframePath)) {
    writeFileSync(wireframePath, renderWireframe(readFileSync(sitemapPath, "utf8"), brief, answers), "utf8");
    return result("wireframe", projectDir);
  }

  if (input.approval?.stage === "wireframe") recordText(state, "wireframe", input.approval.text);
  if (state.wireframe !== undefined) writeApprovals(projectDir, state);
  if (state.wireframe === undefined) return result("none", projectDir);

  if (!existsSync(designPath)) {
    writeDesignMd(projectDir, brief, answers, fontsFor(projectDir));
    return result("style-guide", projectDir);
  }

  if (input.approval?.stage === "style-guide") recordText(state, "styleGuide", input.approval.text);
  if (state.styleGuide !== undefined) writeApprovals(projectDir, state);
  if (state.styleGuide === undefined) return result("none", projectDir);

  if (input.approval?.stage === "direction" && directionPicked(projectDir)) {
    recordText(state, "direction", input.approval.text);
  }
  if (state.direction !== undefined) writeApprovals(projectDir, state);
  if (state.direction === undefined) return result("none", projectDir);

  if (input.approval?.stage === "prebuild") recordPrebuild(projectDir, state, brief, input);
  if (state.prebuild !== undefined) writeApprovals(projectDir, state);
  return result("none", projectDir);
}

/** True only when every design stage is approved and no pre-build check fails. */
export function designReadyForBuild(projectDir: string, brief: string): DesignBuildGate {
  const state = readApprovals(projectDir);
  const checks = runPrebuildChecks(brief, projectDir);
  if (typeof brief !== "string") {
    const critique = checks.checks.find((check) => check.id === "critique");
    const reason =
      critique !== undefined && /missing/i.test(critique.detail) ? critique.detail : "The brief is missing.";
    return { ok: false, reason, checks };
  }
  if (state.sitemap === undefined) return { ok: false, reason: "Approve the sitemap before the build.", checks };
  if (state.wireframe === undefined) return { ok: false, reason: "Approve the wireframe before the build.", checks };
  if (state.styleGuide === undefined) return { ok: false, reason: "Approve the style guide before the build.", checks };
  if (state.direction === undefined) return { ok: false, reason: "Approve the direction before the build.", checks };
  const failed = checks.checks.find((check) => check.status === "fail");
  if (failed !== undefined) return { ok: false, reason: failed.detail, checks };
  const warned = checks.checks.some((check) => check.status === "warn");
  if (warned && state.warningsAck !== true) {
    return { ok: false, reason: "Acknowledge the pre-build warnings before the build.", checks };
  }
  if (state.prebuild === undefined) return { ok: false, reason: "Approve the pre-build checks before the build.", checks };
  return { ok: true, reason: "", checks };
}

function recordPrebuild(projectDir: string, state: StageApprovals, brief: string, input: DesignStageRequest): void {
  const report = runPrebuildChecks(brief, projectDir);
  if (input.acknowledge === true) state.warningsAck = true;
  const failed = report.checks.some((check) => check.status === "fail");
  const warned = report.checks.some((check) => check.status === "warn");
  if (failed || (warned && state.warningsAck !== true)) return;
  recordText(state, "prebuild", input.approval?.text ?? "");
}

function recordText(state: StageApprovals, key: keyof StageApprovals, text: string): void {
  const trimmed = text.trim();
  if (trimmed === "") return;
  if (key === "warningsAck") return;
  state[key] = trimmed;
}

function directionPicked(projectDir: string): boolean {
  try {
    const picked = readDirectionDeal(projectDir)?.pickedId;
    return picked !== null && picked !== undefined;
  } catch {
    return false;
  }
}

function recordChosenDirection(projectDir: string, direction: DesignStageRequest["direction"]): void {
  if (direction === undefined) return;
  const id = direction.id.trim();
  const reason = direction.reason.trim();
  if (id === "" || reason === "") return;
  if (direction.at === undefined) chooseDirection(projectDir, id, reason);
  else chooseDirection(projectDir, id, reason, direction.at);
}

function result(wrote: DesignStageResult["wrote"], projectDir: string): DesignStageResult {
  return {
    wrote,
    sitemap: existsSync(path.join(projectDir, SITEMAP_REL)),
    wireframe: existsSync(path.join(projectDir, WIREFRAME_REL)),
    designMd: existsSync(path.join(projectDir, "DESIGN.md")),
  };
}

function applyChange(projectDir: string, brief: string, answers: readonly BrandAnswer[], text: string): DesignStageResult {
  const sitemapPath = path.join(projectDir, SITEMAP_REL);
  if (!existsSync(sitemapPath)) writeFileSync(sitemapPath, renderSitemap(brief, answers), "utf8");
  const parsed = parseSitemap(readFileSync(sitemapPath, "utf8"));
  const base = parsed.length > 0 ? parsed : pagesFromBrief(brief, answers);
  const edited = reviseSitemap(base, text);
  if (!edited.applied) return result("none", projectDir);
  writeFileSync(sitemapPath, renderSitemapPages(edited.pages), "utf8");
  writeApprovals(projectDir, {});
  removeIfExists(path.join(projectDir, WIREFRAME_REL));
  removeIfExists(path.join(projectDir, "DESIGN.md"));
  return result("none", projectDir);
}

function removeIfExists(file: string): void {
  if (existsSync(file)) rmSync(file);
}

function renderSitemap(brief: string, answers: readonly BrandAnswer[]): string {
  return renderSitemapPages(pagesFromBrief(brief, answers));
}

function renderSitemapPages(pages: readonly SitemapPage[]): string {
  const lines = ["# Sitemap", ""];
  const primary = pages.filter((page) => page.group !== "footer");
  const footer = pages.filter((page) => page.group === "footer");
  lines.push("## Primary", "");
  for (const page of primary) pushPage(lines, page);
  if (footer.length > 0) {
    lines.push("", "## Footer", "");
    for (const page of footer) pushPage(lines, page);
  }
  lines.push("");
  return lines.join("\n");
}

function pushPage(lines: string[], page: SitemapPage): void {
  lines.push(`- ${page.title} at ${page.route}`);
  for (const section of page.sections) lines.push(`  - ${section}`);
}

function renderWireframe(sitemap: string, brief: string, answers: readonly BrandAnswer[]): string {
  const parsed = parseSitemap(sitemap);
  const pages = parsed.length > 0 ? parsed : pagesFromBrief(brief, answers);
  const lines = ["# Wireframe", ""];
  for (const page of pages) {
    lines.push(`## ${page.title}`, "");
    const sections = page.sections.length > 0 ? page.sections : ["hero"];
    for (const section of sections) lines.push(box(section), "");
  }
  return lines.join("\n");
}

function pagesFromBrief(brief: string, answers: readonly BrandAnswer[]): SitemapPage[] {
  return planFromBrief(brief, briefAnswers(answers)).pages.map((page) => ({
    title: page.title,
    route: page.route,
    sections: [...page.sections],
    group: FOOTER_TITLES.has(page.title.toLowerCase()) ? "footer" : "primary",
  }));
}

function parseSitemap(text: string): SitemapPage[] {
  const pages: SitemapPage[] = [];
  let group: SitemapPage["group"] = "primary";
  let current: SitemapPage | null = null;
  for (const line of text.split(/\n/)) {
    const trimmed = line.trim();
    if (/^##\s+footer\b/i.test(trimmed)) {
      group = "footer";
      current = null;
      continue;
    }
    if (/^##\s+primary\b/i.test(trimmed)) {
      group = "primary";
      current = null;
      continue;
    }
    if (/^- /.test(line)) {
      const match = /^- (.+?) at (\S+)\s*$/.exec(trimmed);
      if (match?.[1] === undefined || match[2] === undefined) continue;
      current = { title: match[1].trim(), route: match[2].trim(), sections: [], group };
      pages.push(current);
      continue;
    }
    if (current !== null && /^\s+-\s+/.test(line)) current.sections.push(line.replace(/^\s+-\s+/, "").trim());
  }
  return pages;
}

function reviseSitemap(pages: readonly SitemapPage[], text: string): { pages: SitemapPage[]; applied: boolean } {
  const commands = text
    .split(/\n+|(?<=\.)\s+/)
    .map((part) => part.trim().replace(/\.+$/, "").trim())
    .filter((part) => part !== "");
  let next = pages.map((page) => ({ ...page, sections: [...page.sections] }));
  let applied = false;
  for (const command of commands) {
    const revised = reviseOne(next, command);
    if (revised === null) continue;
    next = revised;
    applied = true;
  }
  return { pages: next, applied };
}

function reviseOne(pages: SitemapPage[], command: string): SitemapPage[] | null {
  const under = /^(?:please\s+)?(?:add|insert)\s+(?:an?\s+)?(.+?)\s+page\s+under\s+(.+)$/i.exec(command);
  if (under?.[1] !== undefined && under[2] !== undefined) return addPage(pages, under[1], under[2]);
  const add = /^(?:please\s+)?(?:add|insert)\s+(?:an?\s+)?(.+?)\s+page$/i.exec(command);
  if (add?.[1] !== undefined) return addPage(pages, add[1], "");
  const rename = /^rename\s+(.+?)\s+to\s+(.+)$/i.exec(command);
  if (rename?.[1] !== undefined && rename[2] !== undefined) return renamePage(pages, rename[1], rename[2]);
  const move = /^move\s+(.+?)\s+(?:under|below|into)\s+(.+)$/i.exec(command);
  if (move?.[1] !== undefined && move[2] !== undefined) return movePage(pages, move[1], move[2]);
  const remove = /^(?:please\s+)?(?:remove|delete|drop)\s+(?:the\s+)?(.+?)(?:\s+page)?$/i.exec(command);
  if (remove?.[1] !== undefined) return removePage(pages, remove[1]);
  return null;
}

function addPage(pages: SitemapPage[], rawTitle: string, rawParent: string): SitemapPage[] | null {
  const title = cleanTitle(rawTitle);
  if (title === "") return null;
  if (pages.some((page) => sameTitle(page.title, title))) return pages;
  const parent = cleanTitle(rawParent);
  const parentIndex = pages.findIndex((page) => sameTitle(page.title, parent));
  const group = parentIndex >= 0 ? pages[parentIndex]?.group ?? groupFor(title) : groupFor(title);
  const page = makePage(title, group);
  const copy = [...pages];
  if (parentIndex >= 0) copy.splice(parentIndex + 1, 0, page);
  else copy.push(page);
  return copy;
}

function removePage(pages: SitemapPage[], rawTitle: string): SitemapPage[] | null {
  const title = cleanTitle(rawTitle);
  if (title === "" || !pages.some((page) => sameTitle(page.title, title))) return null;
  return pages.filter((page) => !sameTitle(page.title, title));
}

function renamePage(pages: SitemapPage[], rawFrom: string, rawTo: string): SitemapPage[] | null {
  const from = cleanTitle(rawFrom);
  const to = cleanTitle(rawTo);
  if (from === "" || to === "") return null;
  const index = pages.findIndex((page) => sameTitle(page.title, from));
  const current = index >= 0 ? pages[index] : undefined;
  if (current === undefined) return null;
  if (pages.some((page, place) => place !== index && sameTitle(page.title, to))) return null;
  const copy = pages.map((page) => ({ ...page, sections: [...page.sections] }));
  const target = copy[index];
  if (target === undefined) return null;
  target.title = to;
  target.route = routeFor(to);
  target.group = groupFor(to);
  return copy;
}

function movePage(pages: SitemapPage[], rawTitle: string, rawParent: string): SitemapPage[] | null {
  const title = cleanTitle(rawTitle);
  const parent = cleanTitle(rawParent);
  const index = pages.findIndex((page) => sameTitle(page.title, title));
  const current = index >= 0 ? pages[index] : undefined;
  if (current === undefined || parent === "") return null;
  const copy = pages.filter((_, place) => place !== index).map((page) => ({ ...page, sections: [...page.sections] }));
  const parentIndex = copy.findIndex((page) => sameTitle(page.title, parent));
  const moved = { ...current, sections: [...current.sections], group: parentIndex >= 0 ? copy[parentIndex]?.group ?? current.group : current.group };
  if (FOOTER_TITLES.has(moved.title.toLowerCase())) moved.group = "footer";
  if (parentIndex >= 0) copy.splice(parentIndex + 1, 0, moved);
  else copy.push(moved);
  return copy;
}

function makePage(title: string, group: SitemapPage["group"]): SitemapPage {
  const slug = pageSlug(title);
  return {
    title,
    route: routeFor(title),
    sections: slug === "" || slug === "home" ? ["hero"] : [`${slug}-main`],
    group: FOOTER_TITLES.has(title.toLowerCase()) ? "footer" : group,
  };
}

function cleanTitle(raw: string): string {
  return raw.replace(/^["']|["']$/g, "").replace(/\s+/g, " ").trim();
}

function sameTitle(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function groupFor(title: string): SitemapPage["group"] {
  return FOOTER_TITLES.has(title.toLowerCase()) ? "footer" : "primary";
}

function routeFor(title: string): string {
  if (title.toLowerCase() === "home") return "/";
  const slug = pageSlug(title);
  return slug === "" ? "/" : `/${slug}`;
}

function pageSlug(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function box(label: string): string {
  const text = label.replace(/[|]/g, "/");
  const width = Math.max(8, text.length);
  const bar = `+${"-".repeat(width + 2)}+`;
  return `${bar}\n| ${text.padEnd(width, " ")} |\n${bar}`;
}

function briefAnswers(answers: readonly BrandAnswer[]): BriefAnswer[] {
  return answers.map((answer, index) => ({
    id: answer.id ?? `stage-${index + 1}`,
    value: answer.value,
    ...(answer.status === undefined ? {} : { status: answer.status }),
  }));
}

function resolveAnswers(projectDir: string, provided: readonly BrandAnswer[] | undefined): BrandAnswer[] {
  if (provided !== undefined && provided.length > 0) return [...provided];
  return loadInterviewAnswers(projectDir);
}

function loadInterviewAnswers(projectDir: string): BrandAnswer[] {
  const file = path.join(projectDir, ".hitchhiker", "interview.json");
  if (!existsSync(file)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    const list = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.answers)
        ? parsed.answers
        : [];
    const answers: BrandAnswer[] = [];
    for (const item of list) {
      if (!isRecord(item) || typeof item.id !== "string" || typeof item.value !== "string") continue;
      const answer: BrandAnswer = { id: item.id, value: item.value };
      if (typeof item.status === "string") answer.status = item.status;
      answers.push(answer);
    }
    return answers;
  } catch {
    return [];
  }
}

function fontsFor(projectDir: string): DesignFontChoice | null {
  try {
    const deal = readDirectionDeal(projectDir);
    if (deal?.pickedId === null || deal?.pickedId === undefined) return null;
    const picked = deal.directions.find((direction) => direction.id === deal.pickedId);
    if (picked === undefined || picked.display.trim() === "" || picked.body.trim() === "") return null;
    return { display: picked.display.trim(), body: picked.body.trim(), source: "picked direction" };
  } catch {
    return null;
  }
}

/**
 * A pick rewrites the style guide from the kit and the picked pair.
 * Sitemap and wireframe approvals stay. The guide is approved again.
 * A missing DESIGN.md is left alone so a pick before the guide does nothing.
 */
function refreshStyleGuideAfterDirection(projectDir: string): void {
  try {
    const designPath = path.join(projectDir, "DESIGN.md");
    if (!existsSync(designPath)) return;
    let brief = "";
    try {
      brief = readFileSync(path.join(projectDir, ".hitchhiker", "SITE-BRIEF.md"), "utf8");
    } catch {
      brief = "";
    }
    const answers = loadInterviewAnswers(projectDir);
    writeDesignMd(projectDir, brief, answers, fontsFor(projectDir));
    const state = readApprovals(projectDir);
    if (state.styleGuide === undefined && state.prebuild === undefined && state.warningsAck !== true) return;
    delete state.styleGuide;
    delete state.prebuild;
    delete state.warningsAck;
    writeApprovals(projectDir, state);
  } catch {
    // A lint failure must not undo the saved pick.
  }
}

function readApprovals(projectDir: string): StageApprovals {
  const file = path.join(projectDir, STAGE_APPROVALS_REL);
  if (!existsSync(file)) return {};
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!isRecord(parsed)) throw new Error("design-stages.json must be an object.");
  const state: StageApprovals = {};
  if (typeof parsed.sitemap === "string" && parsed.sitemap.trim() !== "") state.sitemap = parsed.sitemap;
  if (typeof parsed.wireframe === "string" && parsed.wireframe.trim() !== "") state.wireframe = parsed.wireframe;
  if (typeof parsed.styleGuide === "string" && parsed.styleGuide.trim() !== "") state.styleGuide = parsed.styleGuide;
  if (typeof parsed.direction === "string" && parsed.direction.trim() !== "") state.direction = parsed.direction;
  if (typeof parsed.prebuild === "string" && parsed.prebuild.trim() !== "") state.prebuild = parsed.prebuild;
  if (parsed.warningsAck === true) state.warningsAck = true;
  return state;
}

function writeApprovals(projectDir: string, state: StageApprovals): void {
  const body: StageApprovals = {};
  if (state.sitemap !== undefined) body.sitemap = state.sitemap;
  if (state.wireframe !== undefined) body.wireframe = state.wireframe;
  if (state.styleGuide !== undefined) body.styleGuide = state.styleGuide;
  if (state.direction !== undefined) body.direction = state.direction;
  if (state.prebuild !== undefined) body.prebuild = state.prebuild;
  if (state.warningsAck === true) body.warningsAck = true;
  writeFileSync(path.join(projectDir, STAGE_APPROVALS_REL), `${JSON.stringify(body, null, 2)}\n`, "utf8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

onDirectionPicked(refreshStyleGuideAfterDirection);
