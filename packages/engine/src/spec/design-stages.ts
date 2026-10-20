/**
 * Sitemap, then a section wireframe, then DESIGN.md.
 * The next artifact is written only after a recorded approval.
 * A blank answer is not an approval. This module does not call a model.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chooseDirection } from "../brand/directions.ts";
import type { BrandAnswer } from "../brand/kit-from-interview.ts";
import { planFromBrief, type BriefAnswer } from "./brief-plan.ts";
import { writeDesignMd } from "./design-outputs.ts";

export const SITEMAP_REL = ".hitchhiker/sitemap.md";
export const WIREFRAME_REL = ".hitchhiker/wireframe.md";
export const STAGE_APPROVALS_REL = ".hitchhiker/design-stages.json";

export type DesignStageName = "sitemap" | "wireframe";

export interface DesignStageRequest {
  brief: string;
  answers?: readonly BrandAnswer[];
  approval?: { stage: DesignStageName; text: string };
  /** Set only when the person picked a dealt direction. Blank is not a choice. */
  direction?: { id: string; reason: string; at?: string };
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
}

export function advanceDesignStages(projectDir: string, input: DesignStageRequest): DesignStageResult {
  recordChosenDirection(projectDir, input.direction);
  const brief = input.brief;
  const answers = input.answers ?? [];
  const sitemapPath = path.join(projectDir, SITEMAP_REL);
  const wireframePath = path.join(projectDir, WIREFRAME_REL);
  const designPath = path.join(projectDir, "DESIGN.md");
  mkdirSync(path.join(projectDir, ".hitchhiker"), { recursive: true });
  const state = readApprovals(projectDir);

  if (!existsSync(sitemapPath)) {
    writeFileSync(sitemapPath, renderSitemap(brief, answers), "utf8");
    return result("sitemap", projectDir);
  }

  if (input.approval?.stage === "sitemap") {
    const text = input.approval.text.trim();
    if (text !== "") {
      state.sitemap = text;
      writeApprovals(projectDir, state);
    }
  }

  if (state.sitemap === undefined) return result("none", projectDir);

  if (!existsSync(wireframePath)) {
    writeFileSync(wireframePath, renderWireframe(brief, answers), "utf8");
    return result("wireframe", projectDir);
  }

  if (input.approval?.stage === "wireframe") {
    const text = input.approval.text.trim();
    if (text !== "") {
      state.wireframe = text;
      writeApprovals(projectDir, state);
    }
  }

  if (state.wireframe === undefined) return result("none", projectDir);

  if (!existsSync(designPath)) {
    writeDesignMd(projectDir, brief, answers);
    return result("style-guide", projectDir);
  }
  return result("none", projectDir);
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

function renderSitemap(brief: string, answers: readonly BrandAnswer[]): string {
  const pages = planFromBrief(brief, briefAnswers(answers)).pages;
  const lines = ["# Sitemap", ""];
  for (const page of pages) {
    lines.push(`- ${page.title} at ${page.route}`);
    for (const section of page.sections) lines.push(`  - ${section}`);
  }
  lines.push("");
  return lines.join("\n");
}

function renderWireframe(brief: string, answers: readonly BrandAnswer[]): string {
  const pages = planFromBrief(brief, briefAnswers(answers)).pages;
  const lines = ["# Wireframe", ""];
  for (const page of pages) {
    lines.push(`## ${page.title}`, "");
    const sections = page.sections.length > 0 ? page.sections : ["hero"];
    for (const section of sections) lines.push(box(section), "");
  }
  return lines.join("\n");
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

function readApprovals(projectDir: string): StageApprovals {
  const file = path.join(projectDir, STAGE_APPROVALS_REL);
  if (!existsSync(file)) return {};
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("design-stages.json must be an object.");
  }
  const record = parsed as Record<string, unknown>;
  const state: StageApprovals = {};
  if (typeof record.sitemap === "string" && record.sitemap.trim() !== "") state.sitemap = record.sitemap;
  if (typeof record.wireframe === "string" && record.wireframe.trim() !== "") state.wireframe = record.wireframe;
  return state;
}

function writeApprovals(projectDir: string, state: StageApprovals): void {
  const body: StageApprovals = {};
  if (state.sitemap !== undefined) body.sitemap = state.sitemap;
  if (state.wireframe !== undefined) body.wireframe = state.wireframe;
  writeFileSync(path.join(projectDir, STAGE_APPROVALS_REL), `${JSON.stringify(body, null, 2)}\n`, "utf8");
}
