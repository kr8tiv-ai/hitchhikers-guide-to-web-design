/**
 * HTML for the drive desk. No disk, no fetch, no model session.
 * The subscription sentence matches formatCost. The server checks that
 * before it sends the page.
 */

import { escapeHtml } from "./card.ts";
import { documentHeadExtras } from "./design/document-head.ts";

export const DRIVE_MAX_ROWS = 200;

export const DRIVE_STATUSES = ["queued", "running", "passed", "fixing", "escalated", "paused"] as const;

export type DriveStatus = (typeof DRIVE_STATUSES)[number];
export type DriveKind = "build" | "review";

export interface DriveItem {
  id: string;
  kind: DriveKind;
  status: DriveStatus;
}

export interface DrivePageOptions {
  token?: string;
  scriptUrl?: string;
}

const STATUS_LABEL: Record<DriveStatus, string> = {
  queued: "Queued",
  running: "Running",
  passed: "Passed",
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

export function queueBodyHtml(items: readonly DriveItem[]): string {
  if (items.length === 0) {
    return `<div class="hh-empty" id="drive-empty">
            <p>${DRIVE_EMPTY_COPY}</p>
            <p class="hh-empty__next"><a class="hh-btn hh-btn--primary" href="/approve">Approve the prompts</a></p>
          </div>`;
  }
  const rows = items.map((item) => row(item)).join("\n");
  return `<div class="hh-table-wrap">
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
          <p class="hh-small">Model, effort, and duration are not on the queue.</p>`;
}

export function escalationsHtml(items: readonly DriveItem[]): string {
  const open = items.filter((item) => item.status === "escalated");
  if (open.length === 0) {
    return `<div class="hh-empty">
            <h2 class="hh-empty__title">No escalations</h2>
            <p>Marvin has nothing to complain about, which is his version of a good hour.</p>
            <p class="hh-empty__next">When a prompt stalls, the answer lands here.</p>
          </div>`;
  }
  return open
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
    const href = escapeHtml(file);
    return `<li class="hh-drive__verdict"><span class="hh-drive__id">${id}</span><a href="${href}">${href}</a></li>`;
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
        <section class="hh-drive__main hh-rise hh-rise--2" id="queue" data-region="queue" aria-labelledby="queue-title">
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
            ${queueBodyHtml(items)}
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
            ${escalationsHtml(items)}
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
        <button class="hh-btn hh-btn--ghost" type="button" data-theme-toggle>Night desk</button>
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
        <p class="hh-error__next">It was left on disk.</p>
      </article>
      </main>
      <footer class="hh-status">
        <span>/hh-dashboard</span>
        <span>Drive</span>
        <span>On this machine</span>
        <span class="hh-status__spacer"></span>
        <button class="hh-btn hh-btn--ghost" type="button" data-theme-toggle>Night desk</button>
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
  const tail = moduleTag === null ? `${INLINE_THEME}\n` : `    ${moduleTag}\n`;
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

function row(item: DriveItem): string {
  const id = escapeHtml(item.id);
  const current = item.status === "running" ? ` class="is-current"` : "";
  const passed = item.status === "passed" ? " hh-drive__status--passed" : "";
  return `<tr${current} data-id="${id}" data-kind="${item.kind}" data-status="${item.status}">
              <td class="hh-drive__id" data-label="Prompt">${id}</td>
              <td data-label="Kind">${KIND_LABEL[item.kind]}</td>
              <td class="hh-drive__status${passed}" data-label="Status">${STATUS_LABEL[item.status]}</td>
            </tr>`;
}

function reviewPath(id: string): string | null {
  const match = /(?:^|[^0-9])(\d{3})(?:[^0-9]|$)/.exec(id);
  const nnn = match?.[1];
  if (nnn === undefined) return null;
  return `reviews/${nnn}-REVIEW.md`;
}
