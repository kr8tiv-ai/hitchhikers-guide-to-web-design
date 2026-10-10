import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { think } from "../ai/think.ts";
import {
  BRIEF_DRAFT_SCHEMA,
  BRIEF_DRAFT_TASK,
  BRIEF_KEYS,
  BRIEF_REVISE_SCHEMA,
  BRIEF_REVISE_TASK,
  type BriefKey,
  type Facts,
  type SiteBrief,
} from "./schemas.ts";
import { loadFacts } from "./suggest.ts";
import { guideTextIssues } from "./validators.ts";
import type { GuideSession } from "./live-turn.ts";

/**
 * Draft the Site Brief, accept a free-text correction, and re-draft only the
 * fields the revision names. The loop ends when the user approves.
 * Approval is the whole reply, not a word buried in a correction.
 */

const APPROVALS = new Set([
  "approve",
  "approved",
  "yes",
  "ok",
  "looks right",
  "that is right",
  "that's right",
  "nothing wrong",
]);

const HEADINGS: Record<BriefKey, string> = {
  goal: "Goal",
  visitor: "Visitor",
  action: "Action",
  offer: "Offer",
  vibe: "Vibe",
  references: "References",
  exists: "Exists",
  protected: "Protected",
  motion: "Motion",
  limits: "Limits",
  hosting: "Hosting",
  coverage: "Coverage",
};

const ANSWER_IDS: Partial<Record<BriefKey, string>> = {
  goal: "DP-2.1",
  visitor: "DP-2.6",
  action: "DP-2.2",
  vibe: "DP-5.3",
  references: "DP-5.2",
  exists: "DP-0.2",
  motion: "DP-6.2",
  hosting: "DP-9.2",
};

const UNSTATED = "The field is not stated yet.";

export async function* briefLoop(
  s: GuideSession,
  deps: { think: typeof think },
): AsyncGenerator<{ draft: SiteBrief; approved: boolean }> {
  const facts = loadFacts(s.projectDir);
  let draft = await draftOrFallback(s, facts, deps);
  let note: unknown = yield { draft, approved: false };
  while (!isApproval(typeof note === "string" ? note : "")) {
    const correction = typeof note === "string" ? note : "";
    draft = await reviseOrFallback(s, facts, draft, correction, deps);
    note = yield { draft, approved: false };
  }
  await writeSiteBrief(s.projectDir, draft);
  const { recordApprovalYes } = await import("../project-file/yes.ts");
  await recordApprovalYes(s.projectDir, "brief-yes.json");
  yield { draft, approved: true };
}

export function isApproval(text: string): boolean {
  const normalized = text.trim().toLowerCase().replaceAll("\u2019", "'").replaceAll("\u2018", "'");
  const stripped = normalized.endsWith(".") ? normalized.slice(0, -1) : normalized;
  return APPROVALS.has(stripped);
}

async function draftOrFallback(
  s: GuideSession,
  facts: Facts,
  deps: { think: typeof think },
): Promise<SiteBrief> {
  const first = await askDraft(s, facts, deps);
  if (first !== null) return first;
  const second = await askDraft(s, facts, deps);
  if (second !== null) return second;
  return deterministicBrief(facts, s.language);
}

async function reviseOrFallback(
  s: GuideSession,
  facts: Facts,
  draft: SiteBrief,
  correction: string,
  deps: { think: typeof think },
): Promise<SiteBrief> {
  const first = await askRevise(s, facts, draft, correction, deps);
  if (first !== null) return first;
  const second = await askRevise(s, facts, draft, correction, deps);
  if (second !== null) return second;
  return deterministicBrief(facts, s.language);
}

async function askDraft(
  s: GuideSession,
  facts: Facts,
  deps: { think: typeof think },
): Promise<SiteBrief | null> {
  try {
    const result = await deps.think(
      {
        task: BRIEF_DRAFT_TASK,
        schema: BRIEF_DRAFT_SCHEMA,
        effort: "xhigh",
        input: [
          "Draft the Site Brief from these answers only.",
          "Do not invent testimonials, awards, or numbers.",
          `Reply language: ${s.language}`,
          renderFacts(facts),
        ].join("\n"),
      },
      { projectDir: s.projectDir },
    );
    const brief = asBrief(result.value, true);
    if (brief === null) return null;
    if (briefIssues(brief, facts, s.language).length > 0) return null;
    return brief;
  } catch {
    return null;
  }
}

async function askRevise(
  s: GuideSession,
  facts: Facts,
  draft: SiteBrief,
  correction: string,
  deps: { think: typeof think },
): Promise<SiteBrief | null> {
  try {
    const result = await deps.think(
      {
        task: BRIEF_REVISE_TASK,
        schema: BRIEF_REVISE_SCHEMA,
        effort: "xhigh",
        input: [
          "Revise only the fields the correction changes. Omit the rest.",
          "Do not invent testimonials, awards, or numbers.",
          `Reply language: ${s.language}`,
          "Current brief:",
          JSON.stringify(draft),
          "Correction:",
          correction,
        ].join("\n"),
      },
      { projectDir: s.projectDir },
    );
    const partial = asBrief(result.value, false);
    if (partial === null) return null;
    const merged = mergeBrief(draft, partial);
    if (briefIssues(merged, facts, s.language).length > 0) return null;
    return merged;
  } catch {
    return null;
  }
}

function briefIssues(brief: SiteBrief, facts: Facts, language: string): string[] {
  const issues: string[] = [];
  for (const key of BRIEF_KEYS) {
    issues.push(...guideTextIssues(brief[key], { language, facts }));
  }
  return issues;
}

function asBrief(value: unknown, full: boolean): SiteBrief | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!full) {
    const partial = emptyBrief();
    let any = false;
    for (const key of BRIEF_KEYS) {
      const field = record[key];
      if (typeof field === "string" && field.trim() !== "") {
        partial[key] = field.trim();
        any = true;
      }
    }
    return any ? partial : emptyBrief();
  }
  const brief = emptyBrief();
  for (const key of BRIEF_KEYS) {
    const field = record[key];
    if (typeof field !== "string" || field.trim() === "") return null;
    brief[key] = field.trim();
  }
  return brief;
}

function mergeBrief(base: SiteBrief, partial: SiteBrief): SiteBrief {
  const next = { ...base };
  for (const key of BRIEF_KEYS) {
    if (partial[key].trim() !== "") next[key] = partial[key];
  }
  return next;
}

function emptyBrief(): SiteBrief {
  return {
    goal: "",
    visitor: "",
    action: "",
    offer: "",
    vibe: "",
    references: "",
    exists: "",
    protected: "",
    motion: "",
    limits: "",
    hosting: "",
    coverage: "",
  };
}

export function deterministicBrief(facts: Facts, language: string): SiteBrief {
  const byId = new Map<string, string>();
  for (const answer of facts.answers) byId.set(answer.id, answer.value);
  const brief = emptyBrief();
  for (const key of BRIEF_KEYS) {
    const id = ANSWER_IDS[key];
    const raw = id === undefined ? "" : (byId.get(id) ?? "");
    brief[key] = safeField(raw, facts, language);
  }
  if (brief.offer === UNSTATED) brief.offer = safeField("", facts, language);
  brief.coverage = safeField("The interview file holds the coverage.", facts, language);
  return brief;
}

function safeField(raw: string, facts: Facts, language: string): string {
  let text = raw.trim();
  if (text.startsWith("ASSUMED:")) text = text.slice("ASSUMED:".length).trim();
  if (text.startsWith("SOFT:")) text = text.slice("SOFT:".length).trim();
  text = stripUnsafe(text);
  if (text === "" || guideTextIssues(text, { language, facts }).length > 0) return UNSTATED;
  return text;
}

function stripUnsafe(text: string): string {
  let out = "";
  for (const ch of text) {
    if (ch === "!" || ch === "\u2014") continue;
    out += ch;
  }
  return out.trim();
}

function renderFacts(facts: Facts): string {
  const lines: string[] = [];
  for (const answer of facts.answers) lines.push(`${answer.id}: ${answer.value}`);
  return lines.join("\n");
}

export function renderSiteBrief(draft: SiteBrief): string {
  const lines: string[] = ["# Site Brief", ""];
  for (const key of BRIEF_KEYS) {
    lines.push(`## ${HEADINGS[key]}`, "", draft[key], "");
  }
  return lines.join("\n");
}

async function writeSiteBrief(projectDir: string, draft: SiteBrief): Promise<void> {
  const dir = path.join(projectDir, ".hitchhiker");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "SITE-BRIEF.md"), renderSiteBrief(draft), "utf8");
}

/** Read the approved brief back. Missing file returns null. */
export function readSiteBrief(projectDir: string): string | null {
  const file = path.join(projectDir, ".hitchhiker", "SITE-BRIEF.md");
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}
