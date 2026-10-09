/**
 * One card per brand line. Approve and reject stay on that line.
 * Chrome uses the Guide desk classes. Copy has no hype and no exclamation marks.
 */

export interface ApproveCardModel {
  itemId: string;
  kind: string;
  body: string;
  status: "pending" | "approved" | "rejected";
  note?: string;
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

export function bindApproveDeck(
  root: ApproveRoot,
  items: readonly ApproveCardModel[],
  onDecision: (itemId: string, status: ApproveDecision, note?: string) => void,
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
  if (root.querySelector("[data-approve]") === null) {
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

function renderOne(item: ApproveCardModel): string {
  const id = escapeHtml(item.itemId);
  const note = item.note?.trim() ?? "";
  const noteBlock =
    note === ""
      ? ""
      : `<p class="hh-approval__note">Note: ${escapeHtml(note)}</p>`;
  return [
    `<article class="hh-approval-card" data-item-id="${id}" data-status="${item.status}" style="${CARD_STYLE}">`,
    `<p class="hh-kicker">${escapeHtml(labelKind(item.kind))}</p>`,
    `<p class="hh-status" data-status-label="${item.status}">${STATUS_LABEL[item.status]}</p>`,
    `<p class="hh-dek">${escapeHtml(item.body)}</p>`,
    noteBlock,
    '<div class="hh-approval">',
    `<button type="button" class="hh-btn hh-btn--primary" data-approve="${id}">Approve</button>`,
    `<button type="button" class="hh-btn hh-btn--secondary" data-reject="${id}">Reject</button>`,
    `<label class="hh-approval__note" style="display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-2);">Note for a redo<input data-note="${id}" value="${escapeHtml(note)}" style="flex:1;min-width:8rem;padding:var(--space-2) var(--space-3);border:1px solid color-mix(in srgb, var(--color-ink) 28%, transparent);border-radius:var(--radius-md);background:var(--color-surface);color:var(--color-ink);font:inherit;" /></label>`,
    "</div>",
    "</article>",
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
