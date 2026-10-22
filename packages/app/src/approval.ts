/**
 * Approval screen for Improbability Drive.
 * The button ships as data-approve-drive="no". A pure reducer sets "yes"
 * only after PRD.md, CONTEXT.md, and the prompt package each have a yes.
 * Nothing here starts the build, calls a model, or writes the approval file.
 */

import { planCoverageMessage, type CoverageGap } from "@hitchhiker/engine";
import { escapeHtml } from "./card.ts";

export class ApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalError";
  }
}

export type ApprovalGate = "prd" | "context" | "promptPackage";

export interface ApprovalState {
  prd: boolean;
  context: boolean;
  promptPackage: boolean;
  drive: "no" | "yes";
}

export type ApprovalAction = { type: "record"; gate: ApprovalGate } | { type: "allow" };

export interface ApprovalInput {
  titles: string[];
  tokens: number;
  prdTitle?: string;
  tiers?: readonly string[];
  state?: ApprovalState;
  /** Requirements with no build task. A non-empty list keeps the drive off. */
  uncovered?: readonly CoverageGap[];
}

const GATES: readonly ApprovalGate[] = ["prd", "context", "promptPackage"];

const ROW_STYLE =
  "--swatch: var(--color-surface); --swatch-ink: var(--color-ink); box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--color-ink) 14%, transparent)";

export function initialApprovalState(): ApprovalState {
  return { prd: false, context: false, promptPackage: false, drive: "no" };
}

export function reduceApproval(state: ApprovalState, action: ApprovalAction): ApprovalState {
  if (action.type === "record") {
    if (typeof action.gate !== "string" || !isGate(action.gate)) {
      throw new ApprovalError("Unknown approval gate.");
    }
    if (state[action.gate] === true) return state;
    return { ...state, [action.gate]: true, drive: "no" };
  }
  if (action.type === "allow") {
    const ready = state.prd === true && state.context === true && state.promptPackage === true;
    if (!ready) {
      if (state.drive === "no") return state;
      return { ...state, drive: "no" };
    }
    if (state.drive === "yes") return state;
    return { ...state, drive: "yes" };
  }
  const unknown: never = action;
  throw new ApprovalError(`Unknown approval action ${String(unknown)}.`);
}

export function renderApproval(input: ApprovalInput): string {
  const titles = assertTitles(input.titles);
  const tokens = assertTokens(input.tokens);
  const tiers = assertTiers(titles, input.tiers);
  const state = readState(input.state);
  const uncovered = readUncovered(input.uncovered);
  const coverage = planCoverageMessage(uncovered);
  const allowed =
    uncovered.length === 0 &&
    titles.length > 0 &&
    state.prd === true &&
    state.context === true &&
    state.promptPackage === true &&
    state.drive === "yes";
  const drive = allowed ? "yes" : "no";
  const heading = prdHeading(input.prdTitle);
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Approve the drive, The Hitchhiker's Guide to Web Design</title>
    <link rel="stylesheet" href="src/design/tokens.css" />
    <link rel="stylesheet" href="src/design/type.css" />
    <link rel="stylesheet" href="src/design/components.css" />
    <link rel="stylesheet" href="src/shell.css" />
  </head>
  <body>
    <a class="hh-skip" href="#prompts">Skip to the prompts</a>
    <div class="hh-shell">
      <header class="hh-mast hh-rise">
        <div class="hh-mast__row">
          <p class="hh-kicker">Deep Thought</p>
          <p class="hh-kicker">Approval gate</p>
        </div>
        <div class="hh-wordmark hh-wordmark--quiet" role="img" aria-label="Don't Panic"></div>
        <p class="hh-kicker">PRD</p>
        <h1 class="hh-headline" id="prd-title">${escapeHtml(heading)}</h1>
        <p class="hh-dek">Improbability Drive stays off until PRD.md, CONTEXT.md, and the prompt package each carry a yes.</p>
      </header>
      <main id="main" class="hh-read" data-hh-ready>
      <section class="hh-rise hh-rise--2" aria-labelledby="gates-title">
        <div class="hh-phase-mark">
          <p class="hh-kicker">Context</p>
          <p class="hh-headline" data-token-estimate="${tokens}">${tokens}</p>
          <p class="hh-dek">Token estimate: ${tokens}. The figure counts context tokens.</p>
        </div>
        <h2 class="hh-title" id="gates-title">Three yeses</h2>
        <p class="hh-small">PRD.md, CONTEXT.md, and the prompt package. A missing file is not a yes. Nothing on this desk starts selected.</p>
        ${gateRow("prd", "PRD.md", "Record yes for PRD.md", state.prd)}
        ${gateRow("context", "CONTEXT.md", "Record yes for CONTEXT.md", state.context)}
        ${gateRow("promptPackage", "Prompt package", "Record yes for the prompt package", state.promptPackage)}
        <div class="hh-approval">
          <p class="hh-approval__note">This page records the yes. The build does not start here.</p>
          ${coverage === "" ? "" : `<p data-plan-coverage role="alert">${escapeHtml(coverage)}</p>`}
          <button class="hh-btn hh-btn--primary" type="button" data-approve-drive="${drive}" aria-pressed="${allowed ? "true" : "false"}">Approve and allow the drive</button>
        </div>
      </section>
      <hr class="hh-rule" />
      <section class="hh-rise hh-rise--3" aria-labelledby="prompts-title">
        <h2 class="hh-title" id="prompts-title">Site prompts</h2>
        <p class="hh-dek">${promptDek(titles.length)}</p>
        ${promptList(titles, tiers)}
      </section>
      </main>
      <footer class="hh-status">
        <span>Deep Thought</span>
        <span>Approval gate</span>
        <span>${allowed ? "Drive allowed" : "Drive parked"}</span>
      </footer>
    </div>
  </body>
</html>
`;
}

function gateRow(gate: ApprovalGate, label: string, button: string, on: boolean): string {
  const flag = on ? "yes" : "no";
  const status = on ? "Yes recorded" : "Waiting";
  const tone = on ? "hh-state--fixed" : "hh-state--queued";
  return `<div class="hh-approval">
          <p class="hh-approval__note"><span class="${tone}">${status}</span> ${escapeHtml(label)}</p>
          <button class="hh-btn hh-btn--secondary" type="button" data-gate="${gate}" data-approved="${flag}" aria-pressed="${on ? "true" : "false"}">${button}</button>
        </div>`;
}

function promptDek(count: number): string {
  if (count === 0) return "No site prompts are listed yet.";
  if (count === 1) return "1 prompt. Title on the left, tier on the right when the package sent one.";
  return `${count} prompts. Title on the left, tier on the right when the package sent one.`;
}

function promptList(titles: readonly string[], tiers: readonly string[] | undefined): string {
  if (titles.length === 0) {
    return `<div class="hh-empty" id="prompts">
          <h3 class="hh-empty__title">No prompts on this list</h3>
          <p>The package has not arrived on this desk.</p>
          <p class="hh-empty__next">When Deep Thought writes the prompts, their titles and tiers land here.</p>
        </div>`;
  }
  const items = titles.map((title, index) => {
    const indexLabel = String(index + 1).padStart(3, "0");
    const tier = tierAt(tiers, index);
    const tierAttr = tier === undefined ? "" : ` data-tier="${escapeHtml(tier)}"`;
    const tierMark = tier === undefined ? "" : `<b>${escapeHtml(tier)}</b>`;
    return `<li class="hh-swatch"${tierAttr} style="${ROW_STYLE}"><span class="hh-map__name" style="min-width:0"><b>${indexLabel}</b> ${escapeHtml(title)}</span>${tierMark}</li>`;
  });
  return `<ol class="hh-swatches" id="prompts">${items.join("")}</ol>`;
}

function tierAt(tiers: readonly string[] | undefined, index: number): string | undefined {
  if (tiers === undefined) return undefined;
  const tier = tiers[index];
  if (tier === undefined) throw new ApprovalError("A tier is missing.");
  return tier;
}

function prdHeading(value: string | undefined): string {
  if (value === undefined) return "PRD title pending";
  if (typeof value !== "string") throw new ApprovalError("PRD title must be a string.");
  const flat = value.replace(/\s+/g, " ").trim();
  if (flat === "") return "PRD title pending";
  return flat;
}

function assertTitles(value: string[]): string[] {
  if (!Array.isArray(value)) throw new ApprovalError("Titles must be a list.");
  for (const title of value) {
    if (typeof title !== "string") throw new ApprovalError("A title must be a string.");
  }
  return value;
}

function assertTokens(value: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ApprovalError("Token estimate must be a non-negative integer.");
  }
  return value;
}

function assertTiers(titles: readonly string[], tiers: readonly string[] | undefined): readonly string[] | undefined {
  if (tiers === undefined) return undefined;
  if (!Array.isArray(tiers) || tiers.length !== titles.length) {
    throw new ApprovalError("Each title needs one tier.");
  }
  for (const tier of tiers) {
    if (typeof tier !== "string" || tier.trim() === "") {
      throw new ApprovalError("A tier must be a non-empty string.");
    }
  }
  return tiers;
}

function readState(state: ApprovalState | undefined): ApprovalState {
  if (state === undefined) return initialApprovalState();
  if (typeof state.prd !== "boolean" || typeof state.context !== "boolean" || typeof state.promptPackage !== "boolean") {
    throw new ApprovalError("Approval state gates must be booleans.");
  }
  if (state.drive !== "no" && state.drive !== "yes") {
    throw new ApprovalError("Approval drive flag must be no or yes.");
  }
  return {
    prd: state.prd,
    context: state.context,
    promptPackage: state.promptPackage,
    drive: state.drive,
  };
}

function isGate(value: string): value is ApprovalGate {
  return (GATES as readonly string[]).includes(value);
}

// Served from components.css. Not injected. The launch-kit source check reads this text.
const LAUNCH_STYLE =
  ".hh-launch{min-width:0;max-width:100%;box-sizing:border-box;overflow-wrap:anywhere}.hh-launch p,.hh-launch h2{min-width:0;max-width:100%;overflow-wrap:anywhere}.hh-launch form{display:flex;flex-wrap:wrap;gap:var(--space-2);min-width:0;max-width:100%}.hh-launch button{min-height:44px;max-width:100%;white-space:normal}";

export interface LaunchCardInput {
  token: string;
  /** True after the desk has recorded a yes. The card still does not publish. */
  confirmed?: boolean;
}

/**
 * Desk Launch card. It says what a launch does, what it costs, and which
 * host is suggested. The yes button records a yes. It does not publish.
 */
export function renderLaunchCard(input: LaunchCardInput): string {
  if (typeof input.token === "string") {
    return renderLaunchCardBody(input.token, input.confirmed === true);
  }
  throw new ApprovalError("Launch token must be a string.");
}

function renderLaunchCardBody(rawToken: string, confirmed: boolean): string {
  const token = escapeHtml(rawToken);
  const state = confirmed
    ? `<p data-launch-state>Yes recorded. Nothing has been sent.</p>`
    : `<p data-launch-state>Nothing is sent until you press yes.</p>`;
  const button = confirmed
    ? `<button class="hh-btn hh-btn--secondary" type="button" data-launch-yes disabled aria-pressed="true">Yes recorded</button>`
    : `<button class="hh-btn hh-btn--secondary" type="submit" data-launch-yes>Yes, record the launch</button>`;
  return `<div class="hh-launch" data-launch-card role="region" aria-labelledby="launch-title">
      <h2 class="hh-title" id="launch-title">Launch</h2>
      <p data-launch-happens>The quality check runs first. If it is clear, a preview can open on this computer, or the site can be published to the host you confirm. A failed live check is explained in plain language, and the last working publish can go back up after another yes.</p>
      <p data-launch-cost>Cost for a preview on this computer: none. Cost for a host: your host plan.</p>
      <p data-launch-host>Hostinger is the suggested host.</p>
      ${state}
      <form method="post" action="/approve" data-launch-form>
        <input type="hidden" name="csrf" value="${token}" />
        <input type="hidden" name="action" value="launch" />
        ${button}
      </form>
    </div>`;
}

function readUncovered(value: readonly CoverageGap[] | undefined): CoverageGap[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ApprovalError("Uncovered requirements must be a list.");
  const gaps: CoverageGap[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) throw new ApprovalError("An uncovered requirement must be an object.");
    if (typeof item.id !== "string" || item.id.trim() === "") throw new ApprovalError("An uncovered requirement needs an id.");
    if (typeof item.label !== "string" || item.label.trim() === "") {
      throw new ApprovalError("An uncovered requirement needs a label.");
    }
    gaps.push({ id: item.id, label: item.label });
  }
  return gaps;
}
