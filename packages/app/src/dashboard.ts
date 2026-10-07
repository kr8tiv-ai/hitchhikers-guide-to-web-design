/**
 * Local drive desk for /hh-dashboard.
 *
 * Reads a queue object and returns HTML. It does not fetch, read disk,
 * or open a model session. Pause is one control for the whole drive.
 * Cost stays a placeholder until a later meter fills it.
 */

import { escapeHtml } from "./card.ts";

export class DashboardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DashboardError";
  }
}

const MAX_ROWS = 200;

/** Replaced when a measured count is available. No dollar figure belongs here. */
const COST_PLACEHOLDER = "Cost is not measured on this desk yet.";

const STATUSES = ["queued", "running", "passed", "fixing", "escalated", "paused"] as const;

type DriveStatus = (typeof STATUSES)[number];
type DriveKind = "build" | "review";

interface DriveItem {
  id: string;
  kind: DriveKind;
  status: DriveStatus;
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

function isStatus(value: string): value is DriveStatus {
  return (STATUSES as readonly string[]).includes(value);
}

function assertId(id: unknown): string {
  if (typeof id !== "string" || id.length === 0) {
    throw new DashboardError("Id is empty.");
  }
  if (/[\u0000\r\n]/.test(id)) {
    throw new DashboardError("Id must be a single line.");
  }
  return id;
}

function assertKind(kind: unknown): DriveKind {
  if (kind === "build" || kind === "review") return kind;
  throw new DashboardError("Queue kind must be build or review.");
}

function assertItem(value: unknown): DriveItem {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DashboardError("Queue item must be an object.");
  }
  const record = value as { id?: unknown; kind?: unknown; status?: unknown };
  const id = assertId(record.id);
  const kind = assertKind(record.kind);
  if (typeof record.status !== "string" || !isStatus(record.status)) {
    throw new DashboardError("Unknown dashboard status.");
  }
  return { id, kind, status: record.status };
}

function assertQueue(queue: { items: Array<{ id: string; kind: string; status: string }> }): DriveItem[] {
  if (typeof queue !== "object" || queue === null || !Array.isArray(queue.items)) {
    throw new DashboardError("Queue needs an items array.");
  }
  if (queue.items.length > MAX_ROWS) {
    throw new DashboardError("Dashboard refuses more than 200 rows.");
  }
  const items: DriveItem[] = [];
  for (const item of queue.items) {
    items.push(assertItem(item));
  }
  return items;
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

function progressBlock(items: readonly DriveItem[]): string {
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

function pauseButton(empty: boolean): string {
  const disabled = empty ? ` aria-disabled="true"` : "";
  return `<button class="hh-btn hh-btn--secondary" type="button" id="drive-pause" data-action="pause"${disabled}>Pause</button>`;
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

function queueBody(items: readonly DriveItem[]): string {
  if (items.length === 0) {
    return `<div class="hh-empty" id="drive-empty">
            <h3 class="hh-empty__title">No drive queued.</h3>
            <p>The drive has not been planned.</p>
            <p class="hh-empty__next">Rows land here when a queue is on disk.</p>
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

function reviewPath(id: string): string | null {
  const match = /(?:^|[^0-9])(\d{3})(?:[^0-9]|$)/.exec(id);
  const nnn = match?.[1];
  if (nnn === undefined) return null;
  return `reviews/${nnn}-REVIEW.md`;
}

function verdicts(items: readonly DriveItem[]): string {
  const reviews = items.filter((item) => item.kind === "review");
  if (reviews.length === 0) {
    return `<p>No Zaphod verdict is on this queue.</p>`;
  }
  const lines = reviews.map((item) => {
    const id = escapeHtml(item.id);
    const path = reviewPath(item.id);
    if (path === null) {
      return `<li class="hh-drive__verdict"><span class="hh-drive__id">${id}</span><span>No numbered review file for this id.</span></li>`;
    }
    const href = escapeHtml(path);
    return `<li class="hh-drive__verdict"><span class="hh-drive__id">${id}</span><a href="${href}">${href}</a></li>`;
  });
  return `<ul class="hh-drive__log">${lines.join("")}</ul>`;
}

function escalations(items: readonly DriveItem[]): string {
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

function watchdog(items: readonly DriveItem[]): string {
  const open = items.filter((item) => item.status === "escalated");
  if (open.length === 0) {
    return `<p>No watchdog line is on this queue.</p>`;
  }
  const lines = open.map((item) => `<li>Prompt ${escapeHtml(item.id)} is escalated.</li>`);
  return `<ul class="hh-drive__log">${lines.join("")}</ul>`;
}

function documentFor(items: readonly DriveItem[]): string {
  const empty = items.length === 0;
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Drive</title>
    <link rel="stylesheet" href="src/design/tokens.css" />
    <link rel="stylesheet" href="src/design/type.css" />
    <link rel="stylesheet" href="src/design/components.css" />
    <link rel="stylesheet" href="src/shell.css" />
    <link rel="stylesheet" href="src/dashboard.css" />
  </head>
  <body>
    <a class="hh-skip" href="#queue">Skip to the queue</a>
    <div class="hh-shell hh-drive">
      <header class="hh-mast hh-rise">
        <div class="hh-mast__row">
          <p class="hh-kicker">Local queue</p>
          <p class="hh-kicker">/hh-dashboard</p>
        </div>
        <div class="hh-wordmark hh-wordmark--quiet" role="img" aria-label="Don't Panic"></div>
        <h1 class="hh-headline" id="drive-title">Drive</h1>
        <p class="hh-dek">The queue on this machine. Not xAI's agent dashboard.</p>
      </header>

      <div class="hh-dash">
        <section class="hh-drive__main hh-rise hh-rise--2" id="queue" data-region="queue" aria-labelledby="queue-title">
          <div class="hh-drive__toolbar">
            <h2 class="hh-title" id="queue-title">Prompt queue</h2>
          </div>
          <div class="hh-approval" data-region="gates">
            ${pauseButton(empty)}
            <a class="hh-btn hh-btn--secondary" href="/approve" data-action="approve">Approve</a>
            <a class="hh-btn hh-btn--secondary" href="/approve" data-action="elevate">Elevate</a>
            <a class="hh-btn hh-btn--secondary" href="/approve" data-action="deploy">Deploy</a>
            <p class="hh-approval__note">Approve, Elevate, and Deploy open the approval gate. This page does not open a model session.</p>
          </div>
          ${queueBody(items)}
        </section>

        <aside class="hh-side hh-rise hh-rise--3">
          <div class="hh-phase-mark">
            <p class="hh-phase-mark__num">04</p>
            <p class="hh-kicker">Improbability Drive</p>
            ${progressBlock(items)}
          </div>
          <section data-region="escalations" aria-label="Escalations">
            ${escalations(items)}
          </section>
          <section data-region="watchdog" aria-labelledby="watchdog-title">
            <h2 class="hh-title" id="watchdog-title">Marvin</h2>
            ${watchdog(items)}
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
            ${verdicts(items)}
          </section>
          <section data-region="lighthouse" aria-labelledby="lighthouse-title">
            <h2 class="hh-title" id="lighthouse-title">Lighthouse</h2>
            <p>Phone Lighthouse has not run.</p>
          </section>
          <section data-region="cost" aria-labelledby="cost-title">
            <h2 class="hh-title" id="cost-title">Cost</h2>
            <p class="hh-kicker">Imagine and API</p>
            <p data-cost-placeholder>${escapeHtml(COST_PLACEHOLDER)}</p>
          </section>
        </div>
      </div>

      <footer class="hh-status">
        <span>/hh-dashboard</span>
        <span>Drive</span>
        <span>On this machine</span>
        <span class="hh-status__spacer"></span>
        <button class="hh-btn hh-btn--ghost" type="button" data-theme-toggle>Night desk</button>
      </footer>
    </div>
    <script>
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
    </script>
  </body>
</html>
`;
}

export function renderDashboard(queue: {
  items: Array<{ id: string; kind: string; status: string }>;
}): string {
  return documentFor(assertQueue(queue));
}
