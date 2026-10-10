import { escapeHtml } from "../card.ts";

/**
 * PATH probes shared with `hh doctor` (`probePathTools` in the CLI).
 * The desk renders this report. It does not spawn the tools itself.
 * The app package cannot depend on the CLI, so `hh app` passes the result in.
 */
export const PREFLIGHT_NAMES = ["grok", "playwright", "whisper", "pdftotext"] as const;

export type PreflightName = (typeof PREFLIGHT_NAMES)[number];

export interface PreflightProbe {
  name: PreflightName;
  ok: boolean;
  detail: string;
}

export interface DeskPreflight {
  grokOk: boolean;
  probes: readonly PreflightProbe[];
}

export const EMPTY_BRAND_ACTION = "Approve the brief to print the kit";

const GROK_MISSING = "Grok is not on PATH.";

export function openQuestionHref(questionId: string | null): string {
  if (questionId === null || !/^[A-Za-z0-9._-]{1,64}$/.test(questionId)) return "/";
  return `/?question=${encodeURIComponent(questionId)}`;
}

/**
 * Ready follows the grok probe only. The other three tools stay warnings.
 * A calm live line is kept once the interview has an answer.
 */
export function deskStatus(input: {
  base: string;
  firstRun: boolean;
  calm: boolean;
  preflight: DeskPreflight | null;
}): string {
  const preflight = input.preflight;
  if (preflight === null) return input.base;
  if (!preflight.grokOk) {
    if (input.firstRun || /\bReady\b/i.test(input.base)) return GROK_MISSING;
    return input.base;
  }
  if (input.firstRun && !input.calm) return "Ready.";
  return input.base;
}

export function renderPreflight(preflight: DeskPreflight): string {
  const byName = new Map(preflight.probes.map((probe) => [probe.name, probe]));
  const rows = PREFLIGHT_NAMES.map((name) => {
    const probe = byName.get(name);
    const ok = probe?.ok === true;
    const detail = probe?.detail ?? (name === "grok" ? "grok: not on PATH" : `${name}: not installed`);
    const state = ok ? "Present" : "Missing";
    return `<tr data-probe="${escapeHtml(name)}" data-probe-state="${ok ? "ok" : "missing"}">
        <td data-label="Check">${escapeHtml(name)}</td>
        <td data-label="Result">${escapeHtml(detail)}</td>
        <td data-label="State">${state}</td>
      </tr>`;
  }).join("");
  return `<div class="hh-table-wrap" data-region="preflight">
    <table class="hh-table" aria-label="Preflight">
      <thead>
        <tr><th>Check</th><th>Result</th><th>State</th></tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>`;
}

/**
 * One next action, linked to the open question.
 * At 375 the shell is a single column with 16px padding. At 1440 the plate
 * sits in the 40rem read column. The button uses the existing rust primary.
 */
export function renderEmptyBrand(questionId: string | null): string {
  const href = escapeHtml(openQuestionHref(questionId));
  const label = questionId === null ? "Open question" : `Open question ${questionId}`;
  return `<section class="hh-specimen hh-rise hh-rise--2" aria-labelledby="brand-title">
        <p class="hh-kicker" id="brand-title">Type</p>
        <p class="hh-specimen__display">No kit on the desk</p>
        <p class="hh-specimen__text">Palette, letters, and voice land on this plate after the brief is approved.</p>
      </section>
      <div class="hh-empty hh-rise hh-rise--3">
        <p class="hh-empty__next"><a class="hh-btn hh-btn--primary" href="${href}">${EMPTY_BRAND_ACTION}</a></p>
        <p><a class="hh-btn hh-btn--ghost" href="${href}">${escapeHtml(label)}</a></p>
      </div>`;
}
