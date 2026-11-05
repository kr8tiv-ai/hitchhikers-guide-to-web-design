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
  designGateReason,
  designReadyForBuild,
  emitDesignStages,
  onDesignLocked,
  readDirectionDeal,
  runPrebuildChecks,
  saveDirectionDeal,
  signatureDeskHtml,
  writeDesignLock,
  type DesignStageName,
} from "@hitchhiker/engine";
import { escapeHtml } from "../card.ts";
import { renderDirectionPicker } from "./direction-desk.ts";
import { renderReferenceDesk } from "./reference-desk.ts";

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
  acknowledge = false,
): Promise<void> {
  await advanceDesignStages(projectDir, {
    brief,
    approval: { stage, text },
    ...(acknowledge ? { acknowledge: true } : {}),
  });
  if (stage !== "style-guide" || text.trim() === "") return;
  if (designGateReason(projectDir, "style-guide") !== "") return;
  if (!stageApprovals(projectDir).styleGuide) return;
  let picked = "";
  try {
    picked = readDirectionDeal(projectDir)?.pickedId ?? "";
  } catch {
    picked = "";
  }
  if (picked === "") return;
  writeDesignLock(projectDir, picked);
  onDesignLocked(projectDir);
}

/** Applies an edit and leaves the stage waiting. It does not record an approval. */
export async function reviseDesignStage(
  projectDir: string,
  brief: string,
  stage: DesignStageName,
  text: string,
): Promise<void> {
  await advanceDesignStages(projectDir, { brief, change: { stage, text } });
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

function stageForm(token: string, stage: DesignStageName, title: string, enabled = true, extra = ""): string {
  const disabled = enabled ? "" : " disabled";
  return `<form method="post" action="/approve">
      <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
      <input type="hidden" name="action" value="stage" />
      <input type="hidden" name="stage" value="${stage}" />
      <label>Change something
        <textarea name="approval" rows="3"></textarea>
      </label>
      ${extra}
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
  const html = renderDesignStageBody(projectDir, token, briefMarkdown);
  const extra = renderReferenceDesk(projectDir, token);
  return extra === "" ? html : `${html}\n${extra}`;
}

function renderDesignStageBody(projectDir: string, token: string, briefMarkdown = ""): string {
  const briefForGate = briefMarkdown.trim() !== "" ? briefMarkdown : briefFor(projectDir);
  designReadyForBuild(projectDir, briefForGate);
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
    const reason = designGateReason(projectDir, "style-guide");
    const note = reason === "" ? "" : `<p data-design-gate>${escapeHtml(reason)}</p>`;
    return `<section data-design-stage="style-guide">
      <h2>Style guide</h2>
      <p>The style guide is in.</p>
      <pre>${escapeHtml(design)}</pre>
      ${signatureDeskHtml(projectDir, token)}
      ${renderDirectionPicker(projectDir)}
      ${note}
      ${stageForm(token, "style-guide", "style guide", reason === "")}
    </section>`;
  }
  if (!state.direction) {
    const reason = designGateReason(projectDir, "direction");
    const note = reason === "" ? "" : `<p data-design-gate>${escapeHtml(reason)}</p>`;
    return `<section data-design-stage="direction">
      <h2>Direction</h2>
      <p>Pick a direction, then approve it.</p>
      ${renderDirectionPicker(projectDir)}
      ${note}
      ${stageForm(token, "direction", "direction", reason === "")}
    </section>`;
  }
  const brief = briefMarkdown.trim() !== "" ? briefMarkdown : briefFor(projectDir);
  const report = runPrebuildChecks(brief, projectDir);
  if (!state.prebuild) {
    const rows = report.checks
      .map((check) => {
        const fix = check.fix.trim() === "" ? "" : ` <span data-prebuild-fix>${escapeHtml(check.fix)}</span>`;
        return `<li data-prebuild-check="${escapeHtml(check.id)}" data-prebuild-pass="${check.pass ? "yes" : "no"}" data-prebuild-status="${escapeHtml(check.status)}">${escapeHtml(check.label)}: ${escapeHtml(check.detail)}${fix}</li>`;
      })
      .join("");
    const warned = report.checks.some((check) => check.status === "warn");
    const ack = warned
      ? `<label>I acknowledge the warnings <input type="checkbox" name="ack" value="yes" /></label>`
      : "";
    const reason = designGateReason(projectDir, "prebuild");
    const note = reason === "" ? "" : `<p data-design-gate>${escapeHtml(reason)}</p>`;
    return `<section data-design-stage="prebuild">
      <h2>Pre-build checks</h2>
      ${note}
      <ul>${rows}</ul>
      ${stageForm(token, "prebuild", "pre-build checks", report.pass && reason === "", ack)}
    </section>`;
  }
  const gate = designReadyForBuild(projectDir, brief);
  return startBuildForm(token, gate.ok, gate.reason);
}
