/**
 * Sitemap, wireframe, style guide, direction, and pre-build checks.
 * Each stage waits for the previous approval. Start build is a separate step.
 * A blank answer is not an approval. This module does not start a build.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  advanceDesignStages,
  dealDirections,
  designReadyForBuild,
  emitDesignStages,
  readDirectionDeal,
  runPrebuildChecks,
  saveDirectionDeal,
  type DesignStageName,
} from "@hitchhiker/engine";
import { escapeHtml } from "../card.ts";
import { renderDirectionPicker } from "./direction-desk.ts";

export async function presentDesignStage(projectDir: string, brief: string): Promise<void> {
  await emitDesignStages(projectDir, { brief });
  try {
    if (readDirectionDeal(projectDir) === null) {
      saveDirectionDeal(projectDir, dealDirections(undefined, projectDir));
    }
  } catch {
    // No studied library: the stage files still show, and the picker stays empty.
  }
}

export async function approveDesignStage(
  projectDir: string,
  brief: string,
  stage: DesignStageName,
  text: string,
): Promise<void> {
  await advanceDesignStages(projectDir, { brief, approval: { stage, text } });
}

function readText(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

interface StageState {
  sitemap: boolean;
  wireframe: boolean;
  styleGuide: boolean;
  direction: boolean;
  prebuild: boolean;
}

function stageApprovals(projectDir: string): StageState {
  const empty: StageState = { sitemap: false, wireframe: false, styleGuide: false, direction: false, prebuild: false };
  const file = path.join(projectDir, ".hitchhiker", "design-stages.json");
  if (!existsSync(file)) return empty;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return empty;
    const record = parsed as Record<string, unknown>;
    const on = (key: string): boolean => typeof record[key] === "string" && record[key].trim() !== "";
    return {
      sitemap: on("sitemap"),
      wireframe: on("wireframe"),
      styleGuide: on("styleGuide"),
      direction: on("direction"),
      prebuild: on("prebuild"),
    };
  } catch {
    return empty;
  }
}

function stageForm(token: string, stage: DesignStageName, title: string, enabled = true): string {
  const disabled = enabled ? "" : " disabled";
  return `<form method="post" action="/approve">
      <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
      <input type="hidden" name="action" value="stage" />
      <input type="hidden" name="stage" value="${stage}" />
      <label>Change something
        <textarea name="approval" rows="3"></textarea>
      </label>
      <button class="hh-btn hh-btn--primary" type="submit" name="commit" value="approve"${disabled}>Approve ${escapeHtml(title)}</button>
      <button class="hh-btn hh-btn--secondary" type="submit" name="commit" value="change">Change the ${escapeHtml(title)}</button>
    </form>`;
}

function startBuildForm(token: string, enabled: boolean, reason: string): string {
  const disabled = enabled ? "" : " disabled";
  const note = enabled
    ? "This step starts billed work. Grok builds the site from the approved design."
    : reason;
  return `<section data-design-stage="start-build">
      <h2>Start build</h2>
      <p data-start-build-note>${escapeHtml(note)}</p>
      <form method="post" action="/approve">
        <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
        <input type="hidden" name="action" value="start-build" />
        <button class="hh-btn hh-btn--primary" type="submit" data-start-build${disabled}>Start build</button>
      </form>
    </section>`;
}

function briefFor(projectDir: string): string {
  try {
    return readFileSync(path.join(projectDir, ".hitchhiker", "SITE-BRIEF.md"), "utf8");
  } catch {
    return "";
  }
}

/** The stage that is waiting. Rendered from the stage files, not from buildStarted. */
export function renderDesignStagePanel(projectDir: string, token: string, briefMarkdown = ""): string {
  const state = stageApprovals(projectDir);
  const sitemap = readText(path.join(projectDir, ".hitchhiker", "sitemap.md"));
  const wireframe = readText(path.join(projectDir, ".hitchhiker", "wireframe.md"));
  const design = readText(path.join(projectDir, "DESIGN.md"));
  if (!state.sitemap) {
    return `<section data-design-stage="sitemap">
      <h2>Sitemap</h2>
      <pre>${escapeHtml(sitemap)}</pre>
      ${stageForm(token, "sitemap", "sitemap")}
    </section>`;
  }
  if (!state.wireframe) {
    return `<section data-design-stage="wireframe">
      <h2>Wireframe</h2>
      <pre>${escapeHtml(wireframe)}</pre>
      ${stageForm(token, "wireframe", "wireframe")}
    </section>`;
  }
  if (!state.styleGuide) {
    return `<section data-design-stage="style-guide">
      <h2>Style guide</h2>
      <p>The style guide is in.</p>
      <pre>${escapeHtml(design)}</pre>
      ${stageForm(token, "style-guide", "style guide")}
    </section>`;
  }
  if (!state.direction) {
    return `<section data-design-stage="direction">
      <h2>Direction</h2>
      <p>Pick a direction, then approve it.</p>
      ${renderDirectionPicker(projectDir)}
      ${stageForm(token, "direction", "direction")}
    </section>`;
  }
  const brief = briefMarkdown.trim() !== "" ? briefMarkdown : briefFor(projectDir);
  const report = runPrebuildChecks(brief);
  if (!state.prebuild) {
    const rows = report.checks
      .map(
        (check) =>
          `<li data-prebuild-check="${escapeHtml(check.id)}" data-prebuild-pass="${check.pass ? "yes" : "no"}">${escapeHtml(check.label)}: ${escapeHtml(check.detail)}</li>`,
      )
      .join("");
    return `<section data-design-stage="prebuild">
      <h2>Pre-build checks</h2>
      <ul>${rows}</ul>
      ${stageForm(token, "prebuild", "pre-build checks", report.pass)}
    </section>`;
  }
  const gate = designReadyForBuild(projectDir, brief);
  return startBuildForm(token, gate.ok, gate.reason);
}
