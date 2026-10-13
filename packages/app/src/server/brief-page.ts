/**
 * Approve, brand, and dashboard copy for a drafted Site Brief.
 * The shell stays in the desk routes. This file is the panel body only.
 */
import { escapeHtml } from "../card.ts";
import type { BriefDeskView } from "@hitchhiker/engine";

export function approveMain(token: string, desk: BriefDeskView): string {
  if (desk.status === "drafting") {
    return `<div class="hh-empty hh-rise hh-rise--2">
        <h1 class="hh-empty__title">Drafting the Site Brief</h1>
        <p data-guide-reading>Drafting the Site Brief · 0s</p>
      </div>`;
  }
  if (desk.draft === null) {
    return `<div class="hh-empty hh-rise hh-rise--2">
        <h1 class="hh-empty__title">Draft the Site Brief</h1>
        <p>The questions on this desk are finished. Draft the brief from the interview.</p>
      </div>`;
  }
  const started = desk.buildStarted ? `<p data-build-status>The build is started.</p>` : "";
  const progress =
    desk.status === "revising"
      ? `<p data-brief-progress>Reading the change · 0s</p>`
      : `<p data-brief-progress hidden></p>`;
  const same = desk.note === "" ? "" : `<p data-brief-note>${escapeHtml(desk.note)}</p>`;
  const failure =
    desk.error === ""
      ? ""
      : `<p data-brief-error role="alert">${escapeHtml(desk.error)}</p>
        <form method="post" action="/approve">
          <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
          <input type="hidden" name="action" value="retry" />
          <button class="hh-btn hh-btn--secondary" type="submit">Retry</button>
        </form>`;
  const sections = desk.sources
    .map((source) => {
      const change =
        source.questionId === ""
          ? ""
          : `<form method="post" action="/approve">
          <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
          <input type="hidden" name="action" value="change" />
          <input type="hidden" name="correction" value="${escapeHtml(source.questionId)}" />
          <button class="hh-btn hh-btn--ghost" type="submit">Change this answer</button>
        </form>`;
      return `<section>
        <h2>${escapeHtml(source.heading)}</h2>
        <p>${escapeHtml(source.text)}</p>
        <p>Source ${escapeHtml(source.questionId)}: ${escapeHtml(source.answer)}</p>
        ${change}
      </section>`;
    })
    .join("\n");
  return `<div class="hh-rise hh-rise--2" data-brief-status="${escapeHtml(desk.status)}">
        <h1 class="hh-title">Site Brief</h1>
        ${started}
        ${failure}
        ${progress}
        ${same}
        ${sections}
        <form method="post" action="/approve">
          <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
          <button class="hh-btn hh-btn--primary" type="submit" name="action" value="approve">Approve</button>
        </form>
        <form method="post" action="/approve">
          <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
          <input type="hidden" name="action" value="change" />
          <label>Change something
            <textarea name="correction" rows="3"></textarea>
          </label>
          <button class="hh-btn hh-btn--secondary" type="submit" data-brief-change${desk.status === "revising" ? " disabled" : ""}>Change something</button>
        </form>
      </div>`;
}

export function brandBriefMain(desk: BriefDeskView): string {
  const goal = escapeHtml(desk.draft?.goal ?? "");
  if (desk.status === "approved") {
    return `<section class="hh-specimen hh-rise hh-rise--2" aria-labelledby="brand-title">
        <p class="hh-kicker" id="brand-title">Brand kit</p>
        <h1 class="hh-specimen__display">The brief is in</h1>
        <p class="hh-specimen__text" data-brief-goal>${goal}</p>
        <p data-build-phase>${escapeHtml(desk.phase)}</p>
        <p><a class="hh-btn hh-btn--primary" href="/hh-dashboard">The build is started.</a></p>
        <p><a class="hh-btn hh-btn--ghost" href="/approve">Review the Site Brief</a></p>
      </section>`;
  }
  return `<section class="hh-specimen hh-rise hh-rise--2" aria-labelledby="brand-title">
        <p class="hh-kicker" id="brand-title">Brand kit</p>
        <h1 class="hh-specimen__display">The brief is ready for a yes</h1>
        <p class="hh-specimen__text" data-brief-goal>${goal}</p>
        <p><a class="hh-btn hh-btn--primary" href="/approve">Review the Site Brief</a></p>
      </section>`;
}

/** Extra note on the drive page. Empty unless the brief is approved. */
export function dashboardBriefNote(desk: BriefDeskView): string {
  if (desk.status !== "approved") return "";
  const goal = escapeHtml(desk.draft?.goal ?? "");
  return `<p data-build-phase="${escapeHtml(desk.phase)}" data-brief-goal="${goal}">${escapeHtml(desk.phase)} is the next phase. The build is started.</p>`;
}
