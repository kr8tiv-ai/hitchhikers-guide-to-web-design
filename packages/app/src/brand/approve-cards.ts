/**
 * One card per brand line. Approve and reject stay on that line.
 * Chrome uses the Guide desk classes. Copy has no hype and no exclamation marks.
 */

export interface ApproveShotPair {
  beforeSrc: string;
  afterSrc: string;
}

export interface ApproveCardModel {
  itemId: string;
  kind: string;
  body: string;
  status: "pending" | "approved" | "rejected";
  note?: string;
  /** Before and after shots for one improvement pick. Brand lines omit this. */
  shots?: ApproveShotPair;
}

/** One desk card for an improvement pick. Nothing here applies the pick. */
export interface ElevatePickModel {
  itemId: string;
  file: string;
  change: string;
  status: "pending" | "approved" | "rejected";
  beforeSrc: string;
  afterSrc: string;
}

export type ApproveDecision = "approved" | "rejected";

interface ApproveQuery {
  getAttribute(name: string): string | null;
  value?: string;
}

interface ApproveEvent {
  target: ApproveQuery | null;
  preventDefault(): void;
}

export interface ApproveRoot {
  innerHTML: string;
  querySelector(selector: string): ApproveQuery | null;
  addEventListener(type: string, listener: (event: ApproveEvent) => void): void;
  removeEventListener(type: string, listener: (event: ApproveEvent) => void): void;
}

const STATUS_LABEL = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
} as const;

/** Escapes text that would otherwise break out of a tag. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderApproveCards(items: readonly ApproveCardModel[]): string {
  const cards = items.map((item) => renderOne(item)).join("");
  const body = cards === "" ? renderEmpty() : cards;
  return `<section class="hh-approval-deck" aria-label="Brand approvals">${body}</section>`;
}

const SHOT_CSS =
  "<style>.hh-shot-pair{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--space-3);min-width:0}.hh-shot{margin:0;min-width:0}.hh-shot img{display:block;width:100%;max-width:100%;height:auto}.hh-approval-card--pair{min-width:0;max-width:100%;overflow-wrap:anywhere}@media (min-width:40rem){.hh-shot-pair{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}</style>";

/**
 * Before and after shots for each pick. An empty list is the waiting plate.
 * Approving stays on the buttons. This function does not write a file.
 */
export function renderElevatePickCards(items: readonly ElevatePickModel[], emptyNote?: string): string {
  if (items.length === 0) {
    const note = emptyNote?.trim() ?? "";
    const body = note === "" ? renderPickEmpty() : renderPickNote(note);
    return `<section class="hh-approval-deck" aria-label="Improvement approvals">${body}</section>`;
  }
  const cards = items
    .map((item) =>
      renderOne({
        itemId: item.itemId,
        kind: item.file,
        body: item.change,
        status: item.status,
        shots: { beforeSrc: item.beforeSrc, afterSrc: item.afterSrc },
      }),
    )
    .join("");
  return `<section class="hh-approval-deck" aria-label="Improvement approvals">${SHOT_CSS}${cards}</section>`;
}

export function bindApproveDeck(
  root: ApproveRoot,
  items: readonly ApproveCardModel[],
  onDecision: (itemId: string, status: ApproveDecision, note?: string) => void,
  options?: { preserve?: boolean },
): () => void {
  const onClick = (event: ApproveEvent): void => {
    const target = event.target;
    if (target === null) return;
    const approve = target.getAttribute("data-approve");
    if (approve !== null && approve !== "") {
      event.preventDefault();
      onDecision(approve, "approved");
      return;
    }
    // Kit Redo uses data-redo. The file gate clears that section, same as reject.
    const redo = target.getAttribute("data-redo");
    if (redo !== null && redo !== "") {
      event.preventDefault();
      onDecision(redo, "rejected");
      return;
    }
    const reject = target.getAttribute("data-reject");
    if (reject === null || reject === "") return;
    event.preventDefault();
    const note = noteValue(root, reject);
    onDecision(reject, "rejected", note);
  };
  root.addEventListener("click", onClick);
  // A plate that already drew Approve buttons keeps them. An empty root gets the cards.
  // preserve leaves server-rendered pick cards alone, including the empty plate.
  if (options?.preserve !== true && root.querySelector("[data-approve]") === null) {
    root.innerHTML = renderApproveCards(items);
  }
  return () => {
    root.removeEventListener("click", onClick);
  };
}

const CARD_STYLE =
  "display:grid;gap:var(--space-3);margin-top:var(--space-4);padding:var(--space-4);border:1px solid color-mix(in srgb, var(--color-ink) 22%, transparent);border-left:4px solid var(--color-accent);border-radius:var(--radius-md);background:var(--color-surface);";

function renderEmpty(): string {
  return [
    `<article class="hh-approval-card hh-approval-card--empty" style="${CARD_STYLE}">`,
    '<p class="hh-kicker">Babel Fish</p>',
    '<p class="hh-dek">Nothing is waiting for a yes. When a line is drafted, it lands on this desk.</p>',
    "</article>",
  ].join("");
}

function renderPickEmpty(): string {
  return renderPickNote("Nothing is waiting for a yes. When a pick has a before shot and an after shot, it lands here.");
}

function renderPickNote(note: string): string {
  return [
    `<article class="hh-approval-card hh-approval-card--empty" style="${CARD_STYLE}min-width:0;max-width:100%;">`,
    '<p class="hh-kicker">Before and after</p>',
    `<p class="hh-dek">${escapeHtml(note)}</p>`,
    "</article>",
  ].join("");
}

function renderOne(item: ApproveCardModel): string {
  const id = escapeHtml(item.itemId);
  const note = item.note?.trim() ?? "";
  const noteBlock =
    note === ""
      ? ""
      : `<p class="hh-approval__note">Note: ${escapeHtml(note)}</p>`;
  const pair = item.shots !== undefined;
  const style = pair ? `${CARD_STYLE}min-width:0;max-width:100%;overflow-wrap:anywhere;` : CARD_STYLE;
  const pairClass = pair ? " hh-approval-card--pair" : "";
  return [
    `<article class="hh-approval-card${pairClass}" data-item-id="${id}" data-status="${item.status}" style="${style}">`,
    `<p class="hh-kicker">${escapeHtml(labelKind(item.kind))}</p>`,
    `<p class="hh-status" data-status-label="${item.status}">${STATUS_LABEL[item.status]}</p>`,
    `<p class="hh-dek">${escapeHtml(item.body)}</p>`,
    renderShots(item),
    noteBlock,
    '<div class="hh-approval">',
    `<button type="button" class="hh-btn hh-btn--primary" data-approve="${id}">Approve</button>`,
    `<button type="button" class="hh-btn hh-btn--secondary" data-reject="${id}">Reject</button>`,
    `<label class="hh-approval__note" style="display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-2);">Note for a redo<input data-note="${id}" value="${escapeHtml(note)}" style="flex:1;min-width:8rem;padding:var(--space-2) var(--space-3);border:1px solid color-mix(in srgb, var(--color-ink) 28%, transparent);border-radius:var(--radius-md);background:var(--color-surface);color:var(--color-ink);font:inherit;" /></label>`,
    "</div>",
    "</article>",
  ].join("");
}

function renderShots(item: ApproveCardModel): string {
  const shots = item.shots;
  if (shots === undefined) return "";
  const before = escapeHtml(shots.beforeSrc);
  const after = escapeHtml(shots.afterSrc);
  return [
    '<div class="hh-shot-pair" data-shot-pair="true">',
    '<figure class="hh-shot"><figcaption class="hh-kicker">Before</figcaption>',
    `<img data-before="true" src="${before}" alt="Before this pick" width="320" height="180" />`,
    "</figure>",
    '<figure class="hh-shot"><figcaption class="hh-kicker">After</figcaption>',
    `<img data-after="true" src="${after}" alt="After this pick" width="320" height="180" />`,
    "</figure>",
    "</div>",
  ].join("");
}

function labelKind(kind: string): string {
  const cleaned = kind.replace(/[-:]+/g, " ").trim();
  return cleaned === "" ? "Line" : cleaned;
}

function noteValue(root: ApproveRoot, itemId: string): string {
  const field = root.querySelector(`[data-note="${cssEscape(itemId)}"]`);
  const value = field?.value;
  return typeof value === "string" ? value.trim() : "";
}

function cssEscape(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
