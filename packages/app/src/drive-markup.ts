/**
 * HTML for the drive desk. No disk, no fetch, no model session.
 * The subscription sentence matches formatCost. The server checks that
 * before it sends the page.
 */

import { escapeHtml } from "./card.ts";
import { documentHeadExtras } from "./design/document-head.ts";

export const DRIVE_MAX_ROWS = 200;

export const DRIVE_STATUSES = [
  "queued",
  "running",
  "passed",
  "failed",
  "interrupted",
  "fixing",
  "escalated",
  "paused",
] as const;

export type DriveStatus = (typeof DRIVE_STATUSES)[number];
export type DriveKind = "build" | "review";

export interface DriveItem {
  id: string;
  kind: DriveKind;
  status: DriveStatus;
}

/** Live site-build progress. The queue file itself stays items only. */
export interface DriveRun {
  promptId: string;
  status: string;
  model: string;
  effort: string;
  elapsedMs: number;
  lastLines: string[];
  filesWritten: string[];
  reason: string;
  /** Restart recovery notice. Shown when the run reason has moved on. */
  recovery?: string;
  /** True when a billing failure paused the queue. */
  paused?: boolean;
  /** Plain escalation. Empty when there is none. */
  escalation?: string;
  /** Stream stop reason. Empty when the run did not record one. */
  stopReason?: string;
  /** True when this row failed because Grok hit a turn cap. */
  turnLimited?: boolean;
}

/** Queue-wide pause from queue.json. Absent means the queue is not held. */
export interface DrivePause {
  at: string;
  after: string;
}

export interface DrivePageOptions {
  token?: string;
  scriptUrl?: string;
  run?: DriveRun | null;
  pause?: DrivePause | null;
}

const STATUS_LABEL: Record<DriveStatus, string> = {
  queued: "Queued",
  running: "Running",
  passed: "Passed",
  failed: "Failed",
  interrupted: "Interrupted",
  fixing: "Fixing",
  escalated: "Escalated",
  paused: "Paused",
};

const KIND_LABEL: Record<DriveKind, string> = {
  build: "Build",
  review: "Review",
};

const THEME_MODULE = `<script type="module" src="/client/theme.js"></script>`;

/** Route name stays /hh-dashboard. The old xAI disclaimer is not part of the plate. */
const DRIVE_DEK = "The queue on this machine.";

export const DRIVE_EMPTY_COPY = "No queue yet. The plan lands here after you approve the prompts.";

const INLINE_THEME = `    <script>
      const root = document.documentElement;
      const toggle = document.querySelector("[data-theme-toggle]");
      function night() {
        if (root.dataset.theme === "dark") return true;
        if (root.dataset.theme === "light") return false;
        return window.matchMedia("(prefers-color-scheme: dark)").matches;
      }
      function paint() {
        if (toggle) toggle.textContent = night() ? "Day desk" : "Night desk";
      }
      paint();
      if (toggle) {
        toggle.addEventListener("click", () => {
          root.dataset.theme = night() ? "light" : "dark";
          paint();
        });
      }
    </script>`;

export function isDriveStatus(value: string): value is DriveStatus {
  return (DRIVE_STATUSES as readonly string[]).includes(value);
}

export function isDriveKind(value: string): value is DriveKind {
  return value === "build" || value === "review";
}

/** Subscription count. Empty queues have no ratio. The server compares this with formatCost. */
export function costText(items: readonly DriveItem[]): string {
  if (items.length === 0) return "No prompts on this queue.";
  let promptsRun = 0;
  for (const item of items) {
    if (item.status !== "queued") promptsRun += 1;
  }
  return `Prompts ${promptsRun} of ${items.length}.`;
}

export function progressHtml(items: readonly DriveItem[]): string {
  if (items.length === 0) {
    return `<p class="hh-dek" data-region="progress">The drive has not been planned.</p>`;
  }
  const counts = tally(items);
  const rows: Array<[string, string]> = [["Passed", `${counts.passed} of ${items.length}`]];
  const labels: Array<[DriveStatus, string]> = [
    ["running", "Running"],
    ["failed", "Failed"],
    ["interrupted", "Interrupted"],
    ["fixing", "Fixing"],
    ["paused", "Paused"],
    ["escalated", "Escalated"],
    ["queued", "Queued"],
  ];
  for (const [status, label] of labels) {
    const count = counts[status];
    if (count > 0) rows.push([label, String(count)]);
  }
  const body = rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");
  return `<dl class="hh-drive__ledger" data-region="progress">${body}</dl>`;
}

export function driveQueueHeld(
  items: readonly DriveItem[],
  run?: DriveRun | null,
  pause?: DrivePause | null,
): boolean {
  return pause != null || queuePaused(items, run);
}

function holdBanner(pause: DrivePause | null | undefined, held: boolean): string {
  if (pause != null) {
    const label = pause.after === "" ? "Paused before the first prompt." : `Paused after ${escapeHtml(pause.after)}`;
    return `<p data-queue-state="paused">${label}</p><button class="hh-btn hh-btn--secondary" type="button" id="drive-resume" data-action="resume-queue">Resume</button>`;
  }
  return held ? `<p data-queue-state="paused">The queue is paused.</p>` : "";
}

export function queueBodyHtml(
  items: readonly DriveItem[],
  run?: DriveRun | null,
  pause?: DrivePause | null,
): string {
  const banner = holdBanner(pause, driveQueueHeld(items, run, pause));
  if (items.length === 0) {
    return `<div class="hh-empty" id="drive-empty">
            <h2 class="hh-empty__title">No plan is on the desk</h2>
            <p>${DRIVE_EMPTY_COPY}</p>
            <p class="hh-empty__next"><a class="hh-btn hh-btn--primary" href="/approve" data-tip="Opens Approvals, where a plan waits for a yes.">Approve the prompts</a></p>
          </div>`;
  }
  const live = items.some((item) => item.status === "running") || run?.status === "running";
  const rows = items.map((item) => row(item, live, run)).join("\n");
  const tail =
    run == null
      ? `<p class="hh-small">Model, effort, and duration are not on the queue.</p>`
      : runPanel(run);
  return `${banner}<div class="hh-table-wrap">
            <table class="hh-table" aria-labelledby="queue-title">
              <thead>
                <tr>
                  <th scope="col">Prompt</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
          ${tail}`;
}

export function escalationsHtml(items: readonly DriveItem[], run?: DriveRun | null): string {
  const open = items.filter((item) => item.status === "escalated");
  const note = billingNote(run);
  if (open.length === 0 && note === null) {
    return `<div class="hh-empty">
            <h2 class="hh-empty__title">No escalations</h2>
            <p>Marvin has nothing to complain about, which is his version of a good hour.</p>
            <p class="hh-empty__next">When a prompt stalls, the answer lands here.</p>
          </div>`;
  }
  const billing =
    note === null
      ? ""
      : `<article class="hh-error" data-escalation="billing">
            <p class="hh-kicker">Usage balance</p>
            <h3 class="hh-error__title">Top up Grok Build</h3>
            <p>${escapeHtml(note)}</p>
            <p class="hh-error__next">Top up the balance, then press Retry on the failed prompt.</p>
          </article>`;
  const rows = open
    .map((item) => {
      const id = escapeHtml(item.id);
      return `<article class="hh-error" data-escalation-for="${id}">
            <p class="hh-kicker">Prompt ${id}</p>
            <h3 class="hh-error__title">${id}</h3>
            <p>The queue marks this prompt escalated. The reason is not on the queue file.</p>
            <p class="hh-error__next">The work already saved stays on disk.</p>
            <p><a class="hh-btn hh-btn--secondary" href="#drive-pause">Open the pause control</a></p>
          </article>`;
    })
    .join("\n");
  return `${billing}${rows}`;
}

function billingNote(run?: DriveRun | null): string | null {
  if (run == null) return null;
  const escalation = (run.escalation ?? "").trim();
  if (run.paused !== true && escalation === "") return null;
  const text = escalation !== "" ? escalation : run.reason.trim();
  const plain = text.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
  return plain === "" ? null : plain;
}

function queuePaused(items: readonly DriveItem[], run?: DriveRun | null): boolean {
  return run?.paused === true || items.some((item) => item.status === "paused");
}

export function verdictsHtml(items: readonly DriveItem[]): string {
  const reviews = items.filter((item) => item.kind === "review");
  if (reviews.length === 0) {
    return `<p>No Zaphod verdict is on this queue.</p>`;
  }
  const lines = reviews.map((item) => {
    const id = escapeHtml(item.id);
    const file = reviewPath(item.id);
    if (file === null) {
      return `<li class="hh-drive__verdict"><span class="hh-drive__id">${id}</span><span>No numbered review file for this id.</span></li>`;
    }
    // The path is a project file. A relative href resolves on the desk and 404s.
    const shown = escapeHtml(file);
    return `<li class="hh-drive__verdict"><span class="hh-drive__id">${id}</span><span>${shown}</span></li>`;
  });
  return `<ul class="hh-drive__log">${lines.join("")}</ul>`;
}

export function watchdogHtml(items: readonly DriveItem[]): string {
  const open = items.filter((item) => item.status === "escalated");
  if (open.length === 0) {
    return `<p>No watchdog line is on this queue.</p>`;
  }
  const lines = open.map((item) => `<li>Prompt ${escapeHtml(item.id)} is escalated.</li>`);
  return `<ul class="hh-drive__log">${lines.join("")}</ul>`;
}

export function renderDriveDocument(
  items: readonly DriveItem[],
  cost: string,
  options?: DrivePageOptions,
): string {
  const empty = items.length === 0;
  const body = `<a class="hh-skip" href="#queue">Skip to the queue</a>
    <div class="hh-shell hh-drive">
      <header class="hh-mast hh-rise">
        <div class="hh-mast__row">
          <p class="hh-kicker">Local queue</p>
          <p class="hh-kicker">/hh-dashboard</p>
        </div>
        <div class="hh-wordmark hh-wordmark--quiet" role="img" aria-label="Don't Panic"></div>
        <h1 class="hh-headline" id="drive-title">Drive</h1>
        <p class="hh-dek">${DRIVE_DEK}</p>
      </header>

      <main id="drive-main" data-hh-ready>
      <div class="hh-dash">
        <section class="hh-drive__main hh-rise hh-rise--2" id="queue" data-region="queue"${driveQueueHeld(items, options?.run, options?.pause) ? ' data-queue-state="paused"' : ""} aria-labelledby="queue-title">
          <div class="hh-drive__toolbar">
            <h2 class="hh-title" id="queue-title">Prompt queue</h2>
          </div>
          <div class="hh-approval" data-region="gates">
            ${pauseButton(empty)}
            ${gateLink("approve", "Approve", empty)}
            ${gateLink("elevate", "Elevate", empty)}
            ${gateLink("deploy", "Deploy", empty)}
            <p class="hh-approval__note">Approve, Elevate, and Deploy open the approval gate. This page does not open a model session.</p>
            <p id="drive-pause-note" class="hh-approval__note" role="status" hidden></p>
          </div>
          <div id="drive-queue-body">
            ${queueBodyHtml(items, options?.run, options?.pause)}
          </div>
        </section>

        <aside class="hh-side hh-rise hh-rise--3">
          <div class="hh-phase-mark">
            <p class="hh-phase-mark__num">04</p>
            <p class="hh-kicker">Improbability Drive</p>
            <div id="drive-progress">
              ${progressHtml(items)}
            </div>
          </div>
          <section data-region="escalations" id="drive-escalations" aria-label="Escalations">
            ${escalationsHtml(items, options?.run)}
          </section>
          <section data-region="watchdog" aria-labelledby="watchdog-title">
            <h2 class="hh-title" id="watchdog-title">Marvin</h2>
            <div id="drive-watchdog">
              ${watchdogHtml(items)}
            </div>
          </section>
        </aside>

        <div class="hh-drive__rest hh-rise hh-rise--4">
          <section data-region="session" aria-labelledby="session-title">
            <h2 class="hh-title" id="session-title">Session</h2>
            <p>No session tail is on this queue.</p>
          </section>
          <section data-region="screenshots" aria-labelledby="shots-title">
            <h2 class="hh-title" id="shots-title">Last review frames</h2>
            <div class="hh-drive__frames">
              <figure class="hh-drive__frame" data-frame="375">
                <figcaption class="hh-kicker">375</figcaption>
                <p>No frame at this width.</p>
              </figure>
              <figure class="hh-drive__frame" data-frame="1440">
                <figcaption class="hh-kicker">1440</figcaption>
                <p>No frame at this width.</p>
              </figure>
            </div>
          </section>
          <section data-region="verdicts" aria-labelledby="verdict-title">
            <h2 class="hh-title" id="verdict-title">Zaphod</h2>
            <div id="drive-verdicts">
              ${verdictsHtml(items)}
            </div>
          </section>
          <section data-region="lighthouse" aria-labelledby="lighthouse-title">
            <h2 class="hh-title" id="lighthouse-title">Lighthouse</h2>
            <p>Phone Lighthouse has not run.</p>
          </section>
          <section data-region="cost" aria-labelledby="cost-title">
            <h2 class="hh-title" id="cost-title">Cost</h2>
            <p class="hh-kicker">Subscription</p>
            <p data-cost-line>${escapeHtml(cost)}</p>
          </section>
        </div>
      </div>
      </main>

      <footer class="hh-status">
        <span>/hh-dashboard</span>
        <span>Drive</span>
        <span>On this machine</span>
        <span class="hh-status__spacer"></span>
        <button class="hh-btn hh-btn--ghost" type="button" data-theme-toggle data-tip="Switches this page between the day desk and the night desk.">Night desk</button>
      </footer>
    </div>`;
  return documentShell("Drive", body, options);
}

export function renderDriveReadError(message: string, options?: DrivePageOptions): string {
  const body = `<a class="hh-skip" href="#drive-error">Skip to the notice</a>
    <div class="hh-shell hh-drive">
      <header class="hh-mast hh-rise">
        <div class="hh-mast__row">
          <p class="hh-kicker">Local queue</p>
          <p class="hh-kicker">/hh-dashboard</p>
        </div>
        <div class="hh-wordmark hh-wordmark--quiet" role="img" aria-label="Don't Panic"></div>
        <h1 class="hh-headline" id="drive-title">Drive</h1>
        <p class="hh-dek">${DRIVE_DEK}</p>
      </header>
      <main id="drive-main" data-hh-ready>
      <article class="hh-error" id="drive-error" role="alert">
        <p class="hh-kicker">Queue file</p>
        <h2 class="hh-error__title">The queue file could not be read.</h2>
        <p>${escapeHtml(message)}</p>
        <p class="hh-error__next">It was left on disk. Fix the JSON, then load this page again.</p>
        <p class="hh-empty__next"><a class="hh-btn hh-btn--primary" href="/hh-dashboard" data-tip="Loads Drive again after the queue file is fixed.">Try again</a></p>
      </article>
      </main>
      <footer class="hh-status">
        <span>/hh-dashboard</span>
        <span>Drive</span>
        <span>On this machine</span>
        <span class="hh-status__spacer"></span>
        <button class="hh-btn hh-btn--ghost" type="button" data-theme-toggle data-tip="Switches this page between the day desk and the night desk.">Night desk</button>
      </footer>
    </div>`;
  return documentShell("Drive", body, options, false);
}

function documentShell(
  title: string,
  body: string,
  options: DrivePageOptions | undefined,
  allowModule = true,
): string {
  const moduleTag = allowModule ? moduleScript(options?.scriptUrl) : THEME_MODULE;
  const themeTail = moduleTag === null ? `${INLINE_THEME}\n` : `    ${moduleTag}\n`;
  const tail = `    <script type="module" src="/client/tooltip.js"></script>\n${themeTail}`;
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />${csrfMeta(options?.token)}
    <meta name="viewport" content="width=device-width, initial-scale=1" />
${documentHeadExtras(DRIVE_DEK)}
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="src/design/tokens.css" />
    <link rel="stylesheet" href="src/design/type.css" />
    <link rel="stylesheet" href="src/design/components.css" />
    <link rel="stylesheet" href="src/shell.css" />
    <link rel="stylesheet" href="src/dashboard.css" />
  </head>
  <body>
    ${body}
${tail}  </body>
</html>
`;
}

function csrfMeta(token: string | undefined): string {
  if (token === undefined || token.length === 0) return "";
  return `\n    <meta name="hh-csrf" content="${escapeHtml(token)}" />`;
}

function moduleScript(url: string | undefined): string | null {
  if (url === undefined || url.length === 0) return null;
  return `<script type="module" src="${escapeHtml(url)}"></script>`;
}

function tally(items: readonly DriveItem[]): Record<DriveStatus, number> {
  const counts: Record<DriveStatus, number> = {
    queued: 0,
    running: 0,
    passed: 0,
    failed: 0,
    interrupted: 0,
    fixing: 0,
    escalated: 0,
    paused: 0,
  };
  for (const item of items) counts[item.status] += 1;
  return counts;
}

function pauseButton(empty: boolean): string {
  const disabled = empty ? ` disabled aria-disabled="true"` : "";
  return `<button class="hh-btn hh-btn--secondary" type="button" id="drive-pause" data-action="pause"${disabled}>Pause</button>`;
}

/**
 * Empty gates are real disabled controls. An anchor ignores the disabled
 * attribute, so the drive client also cancels the click while it is locked.
 * A queue on disk leaves them as links to the approval gate.
 */
function gateLink(action: "approve" | "elevate" | "deploy", label: string, empty: boolean): string {
  const locked = empty ? ` disabled aria-disabled="true"` : "";
  return `<a class="hh-btn hh-btn--secondary" href="/approve" data-action="${action}"${locked}>${label}</a>`;
}

function keepsPartialWork(item: DriveItem, run?: DriveRun | null): boolean {
  if (item.status !== "failed" || run == null || run.promptId !== item.id || run.status !== "failed") return false;
  if (run.turnLimited === true) return true;
  return /desk sets no cap|Grok stopped after \d+ turns/.test(run.reason);
}

function row(item: DriveItem, live = false, run?: DriveRun | null): string {
  const id = escapeHtml(item.id);
  const current = item.status === "running" ? ` class="is-current"` : "";
  const passed = item.status === "passed" ? " hh-drive__status--passed" : "";
  const held = live ? ` disabled aria-disabled="true"` : "";
  const note = keepsPartialWork(item, run) ? `<p class="hh-small" data-retry-note>Partial work is kept.</p>` : "";
  const action =
    item.status === "failed"
      ? ` <button class="hh-btn hh-btn--secondary" type="button" data-action="retry" data-prompt="${id}">Retry</button>${note}`
      : item.status === "interrupted"
        ? ` <button class="hh-btn hh-btn--secondary" type="button" data-action="resume" data-prompt="${id}"${held}>Resume</button>`
        : "";
  return `<tr${current} data-id="${id}" data-kind="${item.kind}" data-status="${item.status}">
              <td class="hh-drive__id" data-label="Prompt">${id}</td>
              <td data-label="Kind">${KIND_LABEL[item.kind]}</td>
              <td class="hh-drive__status${passed}" data-label="Status">${STATUS_LABEL[item.status]}${action}</td>
            </tr>`;
}

function durationText(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes <= 0) return `${rest} s`;
  return `${minutes} min ${rest} s`;
}

function runPanel(run: DriveRun): string {
  const model = escapeHtml(run.model);
  const effort = escapeHtml(run.effort);
  const promptId = escapeHtml(run.promptId);
  const status = escapeHtml(run.status);
  const elapsedMs = Number.isFinite(run.elapsedMs) ? Math.max(0, Math.round(run.elapsedMs)) : 0;
  const visible = shownLines(run.lastLines);
  const files =
    run.filesWritten.length === 0
      ? `<p data-files-written>No project files yet.</p>`
      : `<ul data-files-written>${run.filesWritten.map((file) => `<li>${escapeHtml(file)}</li>`).join("")}</ul>`;
  const recovery = plainSentence(run.recovery ?? "");
  const why = plainSentence(run.reason);
  const recoveryLine =
    recovery === "" ? "" : `<p data-build-reason data-recovery>${escapeHtml(recovery)}</p>`;
  const reasonLine =
    why === "" || why === recovery ? "" : `<p data-build-reason>${escapeHtml(why)}</p>`;
  const reason = `${recoveryLine}${reasonLine}`;
  const log =
    visible.length > 0
      ? `<pre data-build-log>${visible.map((line) => escapeHtml(line)).join("\n")}</pre>`
      : run.status === "failed" || run.paused === true
        ? `<p data-build-log>The build log stays in the project log.</p>`
        : "";
  const held = run.paused === true ? `<p data-queue-state="paused">The queue is paused.</p>` : "";
  return `<section data-region="build-run">
            ${held}
            <p data-build-model="${model}" data-build-effort="${effort}" data-build-elapsed="${elapsedMs}">Model ${model}, effort ${effort}, duration ${durationText(elapsedMs)}.</p>
            <p data-current-prompt="${promptId}">Current prompt ${promptId}.</p>
            <p>Status ${status}.</p>
            ${log}
            ${files}
            ${reason}
          </section>`;
}

function shownLines(lines: readonly string[]): string[] {
  const kept: string[] = [];
  for (const line of lines) {
    if (braceLine(line)) continue;
    const clean = line.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
    if (clean === "") continue;
    kept.push(clean);
  }
  return kept;
}

function braceLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === "") return false;
  if (/^[{}\[\],\s]+$/.test(trimmed)) return true;
  if (/^"[^"]*"\s*:/.test(trimmed)) return true;
  const outside = trimmed.replace(/"(?:\\.|[^"\\])*"/g, "");
  return /[{}]/.test(trimmed) && !/[A-Za-z]/.test(outside);
}

function plainSentence(text: string): string {
  return text.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}

function reviewPath(id: string): string | null {
  const match = /(?:^|[^0-9])(\d{3})(?:[^0-9]|$)/.exec(id);
  const nnn = match?.[1];
  if (nnn === undefined) return null;
  return `reviews/${nnn}-REVIEW.md`;
}
