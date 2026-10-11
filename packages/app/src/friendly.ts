/**
 * A new-user error: what happened, what to do, and the raw detail behind Details.
 * The visible copy never includes a stack frame.
 */

import { escapeHtml } from "./card.ts";

export interface FriendlyInput {
  title: string;
  happened: string;
  next: string;
  detail?: string | null;
  retryHref?: string | null;
  retryLabel?: string;
  copyText?: string | null;
}

const STACK_LINE = /(?:^|\n)\s*at\s+\S+/;

/** Pull stack-shaped text out of a message. A one-line sentence stays visible. */
export function splitPublicError(raw: string): { summary: string; detail: string | null } {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (text.length === 0) {
    return { summary: "Something on the desk did not finish.", detail: null };
  }
  if (!STACK_LINE.test(text) && !text.includes("\n")) {
    return { summary: text, detail: null };
  }
  const first = text.split("\n").find((line) => line.trim().length > 0 && !STACK_LINE.test(`\n${line}`)) ?? "";
  const summary = first.trim().length > 0 && !STACK_LINE.test(`\n${first}`)
    ? first.trim()
    : "Something on the desk did not finish.";
  return { summary, detail: text };
}

export function renderFriendly(input: FriendlyInput): string {
  const visible = splitPublicError(input.happened);
  const detailSource = input.detail ?? visible.detail;
  const detail =
    detailSource !== null && detailSource !== undefined && detailSource.trim().length > 0
      ? `<details class="hh-details"><summary>Details</summary><pre class="hh-details__pre">${escapeHtml(detailSource)}</pre></details>`
      : "";
  const retry =
    input.retryHref !== null && input.retryHref !== undefined && input.retryHref.length > 0
      ? `<a class="hh-btn hh-btn--primary" href="${escapeHtml(input.retryHref)}" data-tip="Goes to the page named on this link.">${escapeHtml(input.retryLabel ?? "Try again")}</a>`
      : "";
  const copy =
    input.copyText !== null && input.copyText !== undefined && input.copyText.length > 0
      ? `<button class="hh-btn hh-btn--ghost" type="button" data-copy="${escapeHtml(input.copyText)}" data-tip="Copies the next step so you can paste it.">Copy the next step</button>`
      : "";
  const actions = retry.length > 0 || copy.length > 0 ? `<p class="hh-empty__next">${retry}${copy}</p>` : "";
  return `<div class="hh-error" role="alert">
  <h1 class="hh-error__title">${escapeHtml(input.title)}</h1>
  <p>${escapeHtml(visible.summary)}</p>
  <p>${escapeHtml(input.next)}</p>
  ${actions}
  ${detail}
</div>`;
}
