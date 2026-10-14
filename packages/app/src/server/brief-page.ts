/**
 * Approve, brand, and dashboard copy for a drafted Site Brief.
 * The shell stays in the desk routes. This file is the panel body only.
 */
import { escapeHtml } from "../card.ts";
import type { BriefDeskView, CoverageRow } from "@hitchhiker/engine";

export interface ApproveCoverage {
  rows: readonly CoverageRow[];
  message: string;
}

function coverageTable(coverage: ApproveCoverage | undefined): string {
  if (coverage === undefined || coverage.rows.length === 0) return "";
  const rows = coverage.rows
    .map((row) => {
      const prompts = row.promptIds.length > 0 ? row.promptIds.join(", ") : row.covered ? "Listed" : "None";
      const status = row.covered ? "Covered" : "Uncovered";
      return `<tr data-coverage-id="${escapeHtml(row.id)}" data-covered="${row.covered ? "yes" : "no"}">
        <td>${escapeHtml(row.label)}</td>
        <td>${escapeHtml(prompts)}</td>
        <td>${status}</td>
      </tr>`;
    })
    .join("\n");
  const blocked = coverage.rows.some((row) => !row.covered);
  const note = blocked
    ? `<p>Approve stays off until every row is covered.</p>${coverage.message === "" ? "" : `<p data-plan-coverage-note>${escapeHtml(coverage.message)}</p>`}`
    : "";
  return `<table class="hh-table" data-plan-coverage>
      <caption>Plan coverage</caption>
      <thead><tr><th>Item</th><th>Prompts</th><th>Status</th></tr></thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    ${note}`;
}

export function approveMain(
  token: string,
  desk: BriefDeskView,
  changeError = "",
  coverage?: ApproveCoverage,
): string {
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
  const coverageError = desk.error.startsWith("These requirements have no build task");
  const failure =
    desk.error === ""
      ? ""
      : `<p data-brief-error${coverageError ? " data-plan-coverage" : ""} role="alert">${escapeHtml(desk.error)}</p>
        <form method="post" action="/approve">
          <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
          <input type="hidden" name="action" value="retry" />
          <button class="hh-btn hh-btn--secondary" type="submit">Retry</button>
        </form>`;
  const sections = desk.sources
    .map((source) => {
      const changeId = source.questionId.split(",")[0]?.trim() ?? "";
      const change =
        /^DP-\d+\.\d+$/.test(changeId)
          ? `<form method="post" action="/approve">
          <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
          <input type="hidden" name="action" value="change" />
          <input type="hidden" name="correction" value="${escapeHtml(changeId)}" />
          <button class="hh-btn hh-btn--ghost" type="submit">Change this answer</button>
        </form>`
          : "";
      const sourceLine =
        source.questionId.trim() === ""
          ? ""
          : `<p>Source ${escapeHtml(source.questionId)}: ${escapeHtml(source.answer)}</p>`;
      return `<section>
        <h2>${escapeHtml(source.heading)}</h2>
        <p>${escapeHtml(source.text)}</p>
        ${sourceLine}
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
        ${coverageTable(coverage)}
        <form method="post" action="/approve">
          <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
          <button class="hh-btn hh-btn--primary" type="submit" name="action" value="approve"${coverage !== undefined && coverage.rows.some((row) => !row.covered) ? " disabled" : ""}>Approve</button>
        </form>
        <form method="post" action="/approve">
          <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
          <input type="hidden" name="action" value="change" />
          <label>Change something
            <textarea name="correction" id="brief-correction" rows="3"${changeError === "" ? "" : ' aria-invalid="true" aria-describedby="brief-change-error"'}></textarea>
          </label>
          ${changeError === "" ? "" : `<p id="brief-change-error" data-change-error role="alert">${escapeHtml(changeError)}</p>`}
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
