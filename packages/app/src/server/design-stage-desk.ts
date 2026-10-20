/**
 * Sitemap, wireframe, and style guide on the desk, after the plan is approved.
 * The next file is written only when the previous stage has an approval.
 * A direction is dealt here and recorded only when the person posts a pick.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  advanceDesignStages,
  dealDirections,
  emitDesignStages,
  readDirectionDeal,
  saveDirectionDeal,
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
  stage: "sitemap" | "wireframe",
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

function stageApprovals(projectDir: string): { sitemap: boolean; wireframe: boolean } {
  const file = path.join(projectDir, ".hitchhiker", "design-stages.json");
  if (!existsSync(file)) return { sitemap: false, wireframe: false };
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { sitemap: false, wireframe: false };
    }
    const record = parsed as { sitemap?: unknown; wireframe?: unknown };
    return {
      sitemap: typeof record.sitemap === "string" && record.sitemap.trim() !== "",
      wireframe: typeof record.wireframe === "string" && record.wireframe.trim() !== "",
    };
  } catch {
    return { sitemap: false, wireframe: false };
  }
}

function stageForm(token: string, stage: "sitemap" | "wireframe", title: string): string {
  return `<form method="post" action="/approve">
      <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
      <input type="hidden" name="action" value="stage" />
      <input type="hidden" name="stage" value="${stage}" />
      <label>Change something
        <textarea name="approval" rows="3"></textarea>
      </label>
      <button class="hh-btn hh-btn--primary" type="submit" name="commit" value="approve">Approve ${escapeHtml(title)}</button>
      <button class="hh-btn hh-btn--secondary" type="submit" name="commit" value="change">Change the ${escapeHtml(title)}</button>
    </form>`;
}

/** The stage that is waiting, plus the direction picker once a set is dealt. */
export function renderDesignStagePanel(projectDir: string, token: string): string {
  const state = stageApprovals(projectDir);
  const sitemap = readText(path.join(projectDir, ".hitchhiker", "sitemap.md"));
  const wireframe = readText(path.join(projectDir, ".hitchhiker", "wireframe.md"));
  const design = readText(path.join(projectDir, "DESIGN.md"));
  let stage = "";
  if (!state.sitemap) {
    stage = `<section data-design-stage="sitemap">
      <h2>Sitemap</h2>
      <pre>${escapeHtml(sitemap)}</pre>
      ${stageForm(token, "sitemap", "sitemap")}
    </section>`;
  } else if (!state.wireframe) {
    stage = `<section data-design-stage="wireframe">
      <h2>Wireframe</h2>
      <pre>${escapeHtml(wireframe)}</pre>
      ${stageForm(token, "wireframe", "wireframe")}
    </section>`;
  } else {
    stage = `<section data-design-stage="style-guide">
      <h2>Style guide</h2>
      <p>The style guide is in.</p>
      <pre>${escapeHtml(design)}</pre>
    </section>`;
  }
  return `${stage}\n${renderDirectionPicker(projectDir)}`;
}
