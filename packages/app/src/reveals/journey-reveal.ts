/**
 * End of the Guide.
 * The approved Site Brief sits beside the live URL, with phone scores,
 * axe, and the jury. The Don't Panic badge is the desk wordmark.
 * It is earned only when every listed gate passed. A failed gate names
 * the fix and withholds the plate.
 *
 * Prompt 142 writes DEPLOY.md and HANDOFF.md. It does not write gate
 * scores. This file reads the 126 gate shape and the 146 DEPLOYS.md
 * record. A missing completed deploy uses the local preview and says so.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SiteBrief } from "@hitchhiker/engine";
import { motion } from "../design/tokens.ts";
import { calmText, escapeHtml, revealDocument } from "./brand-reveal.ts";

/** Jury pass line from the 127 total. A score under this does not earn the badge. */
const JURY_PASS = 70;

const BRIEF_FIELDS: ReadonlyArray<{ key: keyof SiteBrief; label: string }> = [
  { key: "goal", label: "Goal" },
  { key: "visitor", label: "Visitor" },
  { key: "action", label: "Action" },
  { key: "offer", label: "Offer" },
  { key: "vibe", label: "Vibe" },
  { key: "references", label: "References" },
  { key: "exists", label: "Exists" },
  { key: "protected", label: "Protected" },
  { key: "motion", label: "Motion" },
  { key: "limits", label: "Limits" },
  { key: "hosting", label: "Hosting" },
  { key: "coverage", label: "Coverage" },
];

export interface LighthousePoints {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
}

export interface GateSummary {
  lighthouse: {
    status: "PASS" | "BLOCKER";
    performance: number | null;
    accessibility: number | null;
    bestPractices: number | null;
    seo: number | null;
  };
  axe: {
    status: "PASS" | "BLOCKER";
    notes: string[];
  };
  console?: "PASS" | "BLOCKER";
  links?: "PASS" | "BLOCKER";
  weight?: "PASS" | "BLOCKER";
}

export interface JourneyRevealInput {
  brief: SiteBrief;
  liveUrl: string;
  scores: GateSummary;
  jury: number;
  /** False forces the local-preview line. True treats the URL as deployed. */
  deployed?: boolean;
}

interface ReportLighthouse {
  status?: string;
  scores?: Partial<LighthousePoints> | null;
  performance?: number | null;
  accessibility?: number | null;
  bestPractices?: number | null;
  seo?: number | null;
}

/** 126 runners and the 146 phone scores, without inventing a missing number. */
export function gateSummaryFromReport(report: {
  lighthouse: ReportLighthouse | ReadonlyArray<{ status: string }>;
  axe: { status: string; notes?: readonly string[] };
  console?: { errors: number; failedRequests: number };
  links?: { pass: boolean };
  weight?: { status: string };
}): GateSummary {
  const summary: GateSummary = {
    lighthouse: lighthouseFrom(report.lighthouse),
    axe: {
      status: report.axe.status === "PASS" ? "PASS" : "BLOCKER",
      notes: Array.isArray(report.axe.notes) ? report.axe.notes.filter((note) => typeof note === "string") : [],
    },
  };
  if (report.console !== undefined) {
    const clear =
      report.console.errors === 0 &&
      report.console.failedRequests === 0 &&
      Number.isFinite(report.console.errors) &&
      Number.isFinite(report.console.failedRequests);
    summary.console = clear ? "PASS" : "BLOCKER";
  }
  if (report.links !== undefined) summary.links = report.links.pass === true ? "PASS" : "BLOCKER";
  if (report.weight !== undefined) summary.weight = report.weight.status === "PASS" ? "PASS" : "BLOCKER";
  return summary;
}

/** Last completed https URL in a 146 DEPLOYS.md record. */
export function readDeployedUrl(record: string): string | null {
  let found: string | null = null;
  for (const line of record.split(/\r?\n/)) {
    const parsed = parseDeployLine(line.trim());
    if (parsed !== null && parsed.state === "completed") found = parsed.url;
  }
  return found;
}

export function renderJourneyFromProject(input: {
  projectDir: string;
  brief: SiteBrief;
  previewUrl: string;
  scores: GateSummary;
  jury: number;
}): string {
  const record = readDeployRecord(input.projectDir);
  const live = record === null ? null : readDeployedUrl(record);
  if (live === null) {
    return renderJourneyReveal({
      brief: input.brief,
      liveUrl: input.previewUrl,
      scores: input.scores,
      jury: input.jury,
      deployed: false,
    });
  }
  return renderJourneyReveal({
    brief: input.brief,
    liveUrl: live,
    scores: input.scores,
    jury: input.jury,
    deployed: true,
  });
}

export function renderJourneyReveal(input: JourneyRevealInput): string {
  const local = isLocalPreview(input);
  const failed = failedGates(input.scores, input.jury);
  const steps = [
    briefStep(input.brief, 0),
    frameStep(input.liveUrl, local, 1),
    scoreStep(input.scores, input.jury, 2),
    badgeStep(failed, 3),
  ];
  return revealDocument({
    title: "The brief beside the site, The Hitchhiker's Guide to Web Design",
    kicker: "So Long and Thanks for All the Fish",
    headline: "The brief, beside the site",
    dek: "The brief you approved, the site as it stands, and the gates that decide the badge.",
    main: `<div class="rv-stage">${steps.join("")}</div>`,
  });
}

function briefStep(brief: SiteBrief, index: number): string {
  const rows = BRIEF_FIELDS.map((field) => {
    const text = fieldText(brief, field.key);
    return `<div><dt>${field.label}</dt><dd>${escapeHtml(text)}</dd></div>`;
  }).join("");
  return `<section class="rv-step rv-brief" data-reveal-step ${delayStyle(index)} aria-labelledby="brief-title">
    <h2 class="hh-title" id="brief-title">Site brief</h2>
    <dl class="rv-brief">${rows}</dl>
  </section>`;
}

function frameStep(liveUrl: string, local: boolean, index: number): string {
  const src = frameSrc(liveUrl);
  const note = local
    ? "This is the local preview. The site is not deployed yet."
    : "This is the live site.";
  const frame =
    src === null
      ? `<div class="rv-frame" data-frame="missing"><p class="rv-copy">The preview URL is not ready. Open the local preview, then come back.</p></div>`
      : `<div class="rv-frame"><iframe title="Site preview" src="${escapeHtml(src)}" referrerpolicy="no-referrer"></iframe></div>`;
  const showUrl = src !== null && !src.startsWith("file:") && !src.startsWith("about:");
  const urlLine = showUrl ? `<p class="hh-small rv-url">${escapeHtml(src)}</p>` : "";
  return `<section class="rv-step" data-reveal-step data-preview="${local ? "local" : "live"}" ${delayStyle(index)} aria-labelledby="site-title">
    <h2 class="hh-title" id="site-title">The site</h2>
    <p class="rv-note">${note}</p>
    ${frame}
    ${urlLine}
  </section>`;
}

function scoreStep(scores: GateSummary, jury: number, index: number): string {
  const cards = [
    scoreCard("Performance", formatScore(scores.lighthouse.performance), scores.lighthouse.status),
    scoreCard("Accessibility", formatScore(scores.lighthouse.accessibility), scores.lighthouse.status),
    scoreCard("Best practices", formatScore(scores.lighthouse.bestPractices), scores.lighthouse.status),
    scoreCard("SEO", formatScore(scores.lighthouse.seo), scores.lighthouse.status),
    scoreCard("Jury", formatJury(jury), juryPassed(jury) ? "PASS" : "BLOCKER"),
  ].join("");
  const axeClass = scores.axe.status === "PASS" ? "rv-status--pass" : "rv-status--blocker";
  const axeWord = scores.axe.status === "PASS" ? "Pass" : "Blocker";
  const notes = scores.axe.notes
    .map((note) => calmText(note))
    .filter((note) => note !== "")
    .slice(0, 12)
    .map((note) => `<li>${escapeHtml(note)}</li>`)
    .join("");
  const noteList = notes === "" ? "" : `<ul class="rv-notes">${notes}</ul>`;
  const phone = scores.lighthouse.status === "PASS" ? "Pass" : "Blocker";
  return `<section class="rv-step rv-scoreboard" data-reveal-step ${delayStyle(index)} aria-labelledby="gates-title">
    <div class="rv-kicker-row">
      <h2 class="hh-title" id="gates-title">Gates</h2>
      <p class="hh-small">Lighthouse, phone: ${phone}</p>
    </div>
    <ul class="rv-scores">${cards}</ul>
    <p class="hh-small ${axeClass}">axe: ${axeWord}</p>
    ${noteList}
  </section>`;
}

function badgeStep(failed: readonly string[], index: number): string {
  if (failed.length === 0) {
    return `<section class="rv-step rv-award" data-reveal-step data-badge="earned" data-award="towel" ${delayStyle(index)} aria-labelledby="badge-title">
      <h2 class="hh-title" id="badge-title">Badge</h2>
      <div class="rv-badge">
        <div class="rv-badge__plate" role="img" aria-label="Don't Panic badge">${badgeMark()}</div>
        <p class="hh-title">Don't Panic.</p>
        <p class="rv-copy">Every gate on this page passed. The badge is earned.</p>
      </div>
    </section>`;
  }
  const fixes = failed.map((gate) => fixLine(gate)).join(" ");
  return `<section class="rv-step rv-award" data-reveal-step data-badge="held" ${delayStyle(index)} aria-labelledby="badge-title">
    <h2 class="hh-title" id="badge-title">Badge</h2>
    <div class="rv-badge rv-badge--held">
      <p class="hh-title">The badge is not earned.</p>
      <p class="rv-copy">${escapeHtml(fixes)}</p>
      <p class="hh-empty__next">Rerun the named gate. A pass is the only way the badge is given.</p>
    </div>
  </section>`;
}

function scoreCard(label: string, value: string, status: "PASS" | "BLOCKER"): string {
  const tone = status === "PASS" ? "rv-status--pass" : "rv-status--blocker";
  const word = status === "PASS" ? "Pass" : "Blocker";
  return `<li class="rv-score"><span class="hh-micro">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><span class="hh-small ${tone}">${word}</span></li>`;
}

function failedGates(scores: GateSummary, jury: number): string[] {
  const failed: string[] = [];
  if (scores.lighthouse.status !== "PASS") failed.push("Lighthouse");
  if (scores.axe.status !== "PASS") failed.push("axe");
  if (scores.console !== undefined && scores.console !== "PASS") failed.push("console");
  if (scores.links !== undefined && scores.links !== "PASS") failed.push("links");
  if (scores.weight !== undefined && scores.weight !== "PASS") failed.push("weight");
  if (!juryPassed(jury)) failed.push("jury");
  return failed;
}

function juryPassed(jury: number): boolean {
  return Number.isFinite(jury) && jury >= JURY_PASS;
}

function fixLine(gate: string): string {
  if (gate === "Lighthouse") return "Fix Lighthouse.";
  if (gate === "axe") return "Fix axe.";
  if (gate === "console") return "Fix console.";
  if (gate === "links") return "Fix links.";
  if (gate === "weight") return "Fix weight.";
  return "Fix the jury.";
}

function formatScore(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Not recorded";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatJury(jury: number): string {
  if (!Number.isFinite(jury)) return "Not recorded";
  const rounded = Math.round(jury * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function fieldText(brief: SiteBrief, key: keyof SiteBrief): string {
  const value = brief[key];
  if (typeof value !== "string") return "Not recorded.";
  const text = calmText(value);
  return text === "" ? "Not recorded." : text;
}

function isLocalPreview(input: JourneyRevealInput): boolean {
  if (input.deployed === false) return true;
  if (input.deployed === true) return false;
  return urlIsLocal(input.liveUrl);
}

function urlIsLocal(liveUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(liveUrl);
  } catch {
    return true;
  }
  if (parsed.protocol === "file:" || parsed.protocol === "about:") return true;
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function frameSrc(liveUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(liveUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:" && parsed.protocol !== "file:" && parsed.protocol !== "about:") {
    return null;
  }
  return parsed.href;
}

function delayStyle(index: number): string {
  return `style="animation-delay:${index * motion.durations.fast}ms"`;
}

function isLighthouseList(
  value: ReportLighthouse | ReadonlyArray<{ status: string }>,
): value is ReadonlyArray<{ status: string }> {
  return Array.isArray(value);
}

function lighthouseFrom(value: ReportLighthouse | ReadonlyArray<{ status: string }>): GateSummary["lighthouse"] {
  if (isLighthouseList(value)) {
    const pass = value.length > 0 && value.every((row) => row.status === "PASS");
    return {
      status: pass ? "PASS" : "BLOCKER",
      performance: null,
      accessibility: null,
      bestPractices: null,
      seo: null,
    };
  }
  const scores = value.scores ?? null;
  return {
    status: value.status === "PASS" ? "PASS" : "BLOCKER",
    performance: scaleScore(scores?.performance ?? value.performance),
    accessibility: scaleScore(scores?.accessibility ?? value.accessibility),
    bestPractices: scaleScore(scores?.bestPractices ?? value.bestPractices),
    seo: scaleScore(scores?.seo ?? value.seo),
  };
}

function scaleScore(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("A Lighthouse score must be a finite number.");
  }
  const scaled = value <= 1 ? value * 100 : value;
  return Math.round(scaled * 10) / 10;
}

function parseDeployLine(line: string): { state: string; url: string } | null {
  const parts = line.split(" \u2014 ");
  if (parts.length < 5) return null;
  if (!parts[0]?.startsWith("- ")) return null;
  const state = parts[3]?.trim() ?? "";
  const url = parts.slice(4).join(" \u2014 ").trim();
  if (!url.startsWith("https://")) return null;
  return { state, url };
}

function readDeployRecord(projectDir: string): string | null {
  const file = path.join(projectDir, ".hitchhiker", "deploy", "DEPLOYS.md");
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    if (isEnoent(error)) return null;
    throw error;
  }
}

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function badgeMark(): string {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "design", "wordmark.svg");
  let raw = "";
  try {
    raw = readFileSync(file, "utf8").trim();
  } catch {
    return "";
  }
  if (!raw.startsWith("<svg") || !raw.endsWith("</svg>")) return "";
  return raw
    .replace("<svg ", '<svg class="rv-badge__mark" focusable="false" aria-hidden="true" ')
    .replace('fill="#ffffff"', 'fill="currentColor"');
}
