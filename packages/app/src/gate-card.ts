/**
 * Plain-English cards for `.hitchhiker/qa/GATES.json`.
 *
 * "Fix it for me" only asks. The first step shows the question.
 * Yes records the ask in the page address and does not change the site.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { escapeHtml } from "./card.ts";

export type GateCardStatus = "PASS" | "FIX" | "BLOCKER";

export interface GateCardResult {
  id: string;
  status: GateCardStatus;
  reason: string;
  evidence: unknown;
}

export interface GateCardReport {
  head: string;
  results: GateCardResult[];
}

export interface GateCardQuery {
  ask: string | null;
  asked: string | null;
}

const NAMES: Record<string, string> = {
  fonts: "Fonts",
  "type-scale": "Type scale",
  spacing: "Spacing",
  color: "Color",
  imagery: "Pictures",
  motion: "Motion",
  "3d": "3D scene",
  copy: "Words",
  device: "Phones and desktops",
  accessibility: "Accessibility",
  speed: "Speed",
};

const STATUS_LABEL: Record<GateCardStatus, string> = {
  PASS: "In good shape",
  FIX: "Needs a fix",
  BLOCKER: "Blocked",
};

const FONT_PROBLEM = /^(Headline|Body) font is (\d+) bytes\. Maximum is (\d+)\.$/;
const TOTAL_PROBLEM = /^Font files total (\d+) bytes\. Maximum is (\d+)\.$/;

export function sanitizeGateId(value: string | null): string | null {
  if (value === null) return null;
  if (!/^[a-z0-9-]{1,40}$/.test(value)) return null;
  return value;
}

export function gateStatusLine(report: GateCardReport | null): string {
  if (report === null) return "The quality check for this site is not here yet.";
  const blocked = report.results.some((item) => item.status === "BLOCKER");
  if (blocked) return "A blocked check keeps this site from going live.";
  const fix = report.results.some((item) => item.status === "FIX");
  if (fix) return "A check still needs a fix before this site can go live.";
  return "Every check on this card is in good shape.";
}

/** Read the registry file. A missing or unreadable file is an empty desk, not a pass. */
export function readGateReport(projectDir: string): GateCardReport | null {
  if (typeof projectDir !== "string" || projectDir.trim() === "") return null;
  const file = path.join(projectDir, ".hitchhiker", "qa", "GATES.json");
  if (!existsSync(file)) return null;
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(file, "utf8")) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(value) || !Array.isArray(value.results)) return null;
  const results: GateCardResult[] = [];
  for (const item of value.results) {
    const row = readRow(item);
    if (row !== null) results.push(row);
  }
  if (results.length === 0) return null;
  const head = typeof value.head === "string" ? value.head : "";
  return { head, results };
}

export function renderGateCards(report: GateCardReport | null, query: GateCardQuery): string {
  if (report === null) {
    return `<section class="hh-gates" data-gate-cards>
      <h1 class="hh-title">Quality checks</h1>
      <p class="hh-dek">The quality check for this site is not here yet. Nothing was changed.</p>
    </section>`;
  }
  const asked = matchingId(report, query.asked);
  const ask = asked === null ? matchingId(report, query.ask) : null;
  const cards = report.results.map((item) => renderCard(item, ask, asked)).join("\n");
  return `<section class="hh-gates" data-gate-cards>
      <h1 class="hh-title">Quality checks</h1>
      <p class="hh-dek">Each card is one check, in plain words. Fix it for me only asks. A yes records the ask and does not change the site.</p>
      ${cards}
    </section>`;
}

function renderCard(item: GateCardResult, ask: string | null, asked: string | null): string {
  const name = NAMES[item.id] ?? item.id;
  const sentence = plainSentence(item);
  const asking = ask === item.id && item.status !== "PASS";
  const done = asked === item.id && item.status !== "PASS";
  const action = item.status === "PASS" ? "" : asking ? askBlock(item.id, name) : done ? askedBlock(item.id) : fixForm(item.id);
  return `<article class="hh-gate-card" data-gate="${escapeHtml(item.id)}" data-status="${item.status}">
      <p class="hh-kicker">${escapeHtml(name)}</p>
      <p class="hh-gate-card__status">${escapeHtml(STATUS_LABEL[item.status])}</p>
      <p class="hh-gate-card__reason">${escapeHtml(sentence)}</p>
      ${action}
    </article>`;
}

function fixForm(id: string): string {
  return `<form class="hh-gate-card__actions" method="get" action="/gates">
      <input type="hidden" name="ask" value="${escapeHtml(id)}" />
      <button class="hh-btn hh-btn--secondary" type="submit">Fix it for me</button>
    </form>`;
}

function askBlock(id: string, name: string): string {
  const place = name.toLowerCase();
  return `<div class="hh-gate-ask" role="region" aria-label="Ask before a fix">
      <p>Ask to fix the ${escapeHtml(place)}? Nothing on the site changes. A yes only records the ask.</p>
      <form class="hh-gate-card__actions" method="get" action="/gates">
        <input type="hidden" name="asked" value="${escapeHtml(id)}" />
        <button class="hh-btn hh-btn--primary" type="submit">Yes, ask</button>
        <a class="hh-btn hh-btn--ghost" href="/gates">Not now</a>
      </form>
    </div>`;
}

function askedBlock(id: string): string {
  return `<p class="hh-gate-card__asked" role="status" data-asked="${escapeHtml(id)}">Asked. Nothing on the site was changed.</p>`;
}

function matchingId(report: GateCardReport, value: string | null): string | null {
  if (value === null) return null;
  const found = report.results.find((item) => item.id === value && item.status !== "PASS");
  return found === undefined ? null : found.id;
}

export function plainSentence(item: GateCardResult): string {
  const fromEvidence = problemLines(item.evidence).map(fontLine).filter((line): line is string => line !== null);
  if (fromEvidence.length > 0) return fromEvidence.join(" ");
  const reason = item.reason.replace(/\s+/g, " ").trim();
  return reason.length > 0 ? reason : "This check needs a look.";
}

function problemLines(evidence: unknown): string[] {
  if (!isRecord(evidence) || !Array.isArray(evidence.problems)) return [];
  return evidence.problems.filter((item): item is string => typeof item === "string");
}

function fontLine(problem: string): string | null {
  const font = FONT_PROBLEM.exec(problem.trim());
  if (font !== null) {
    const kind = font[1] === "Headline" ? "headline font" : "body font";
    return `Your ${kind} is ${kb(font[2] ?? "")} KB, the limit is ${kb(font[3] ?? "")} KB.`;
  }
  const total = TOTAL_PROBLEM.exec(problem.trim());
  if (total !== null) {
    return `Your font files are ${kb(total[1] ?? "")} KB together, the limit is ${kb(total[2] ?? "")} KB.`;
  }
  return null;
}

/** 40960 bytes is 40 KB. 62000 bytes is 62 KB. */
function kb(raw: string): string {
  const bytes = Number(raw);
  if (!Number.isFinite(bytes) || bytes < 0) return raw;
  const kib = bytes / 1024;
  if (Number.isInteger(kib)) return String(kib);
  const kilo = bytes / 1000;
  if (Number.isInteger(kilo)) return String(kilo);
  return String(Math.round(kib));
}

function readRow(value: unknown): GateCardResult | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || value.id.length === 0) return null;
  if (value.status !== "PASS" && value.status !== "FIX" && value.status !== "BLOCKER") return null;
  if (typeof value.reason !== "string" || value.reason.trim().length === 0) return null;
  return {
    id: value.id,
    status: value.status,
    reason: value.reason.replace(/\s+/g, " ").trim(),
    evidence: value.evidence ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
