import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { think } from "../ai/think.ts";
import { bindPacket, syncAnswer, writePhaseAdvisories } from "../context/index.ts";
import type { PacketOptions } from "../context/packet.ts";
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
import { INTERVIEW_MODEL } from "./interview-call.ts";
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

export const BRIEF_HEADINGS: Record<BriefKey, string> = {
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
  pages: "Pages",
  features: "Features",
  coverage: "Coverage",
};

/** Question ids that fill each field. The primary id stays in BRIEF_ANSWER_IDS. */
export const BRIEF_SOURCES: Record<BriefKey, readonly string[]> = {
  goal: ["DP-2.1"],
  visitor: ["DP-2.6"],
  action: ["DP-2.2"],
  offer: ["DP-2.7"],
  vibe: ["DP-5.3"],
  references: ["DP-5.1", "DP-5.2"],
  exists: ["DP-0.2"],
  protected: ["DP-1.9"],
  motion: ["DP-6.1", "DP-6.2", "DP-6.3", "DP-6.4", "DP-6.6"],
  limits: ["DP-8.4", "DP-9.1", "DP-9.5"],
  hosting: ["DP-9.2"],
  pages: ["DP-2.8"],
  features: ["DP-3.7"],
  coverage: [],
};

export const BRIEF_ANSWER_IDS: Partial<Record<BriefKey, string>> = {
  goal: "DP-2.1",
  visitor: "DP-2.6",
  action: "DP-2.2",
  offer: "DP-2.7",
  vibe: "DP-5.3",
  references: "DP-5.2",
  exists: "DP-0.2",
  protected: "DP-1.9",
  motion: "DP-6.2",
  limits: "DP-8.4",
  hosting: "DP-9.2",
  pages: "DP-2.8",
  features: "DP-3.7",
};

/** One structured reply. Enough for the schema, not an open-ended agent loop. */
export const BRIEF_DRAFT_MAX_TURNS = 4;

/** Token budget for the brief packet. Decisions stay; recent rows trim first. */
export const BRIEF_DRAFT_BUDGET = 1200;

export const BRIEF_DRAFT_ERROR =
  "The brief draft stopped early. These fields stay filled from the interview. Use Retry to ask again.";

const UNSTATED = "The field is not stated yet.";

const BRIEF_PACKET: PacketOptions = { budgetTokens: BRIEF_DRAFT_BUDGET };

export async function* briefLoop(
  s: GuideSession,
  deps: { think: typeof think },
): AsyncGenerator<{ draft: SiteBrief; approved: boolean; error: string }> {
  const facts = loadFacts(s.projectDir);
  const bound = { think: bindPacket(deps.think, s.projectDir, "brief", BRIEF_PACKET) };
  const drafted = await draftOrFallback(s, facts, bound);
  let draft = drafted.brief;
  let note: unknown = yield { draft, approved: false, error: drafted.error };
  while (!isApproval(typeof note === "string" ? note : "")) {
    const correction = typeof note === "string" ? note : "";
    draft = await reviseOrFallback(s, facts, draft, correction, bound);
    note = yield { draft, approved: false, error: "" };
  }
  await writeSiteBrief(s.projectDir, draft);
  const { recordApprovalYes } = await import("../project-file/yes.ts");
  await recordApprovalYes(s.projectDir, "brief-yes.json");
  await syncAnswer(s.projectDir, {
    questionId: "brief",
    text: "Brief approved.",
    source: "approval",
    moveCursor: false,
    summarize: true,
    think: deps.think,
  });
  await writePhaseAdvisories(s.projectDir);
  yield { draft, approved: true, error: "" };
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
): Promise<{ brief: SiteBrief; error: string }> {
  const recorded = deterministicBrief(facts, s.language);
  const first = await askDraft(s, facts, recorded, deps);
  if (first !== null) return { brief: lockRecorded(first, recorded), error: "" };
  const second = await askDraft(s, facts, recorded, deps);
  if (second !== null) return { brief: lockRecorded(second, recorded), error: "" };
  return { brief: recorded, error: BRIEF_DRAFT_ERROR };
}

async function reviseOrFallback(
  s: GuideSession,
  facts: Facts,
  draft: SiteBrief,
  correction: string,
  deps: { think: typeof think },
): Promise<SiteBrief> {
  const recorded = deterministicBrief(facts, s.language);
  const first = await askRevise(s, facts, draft, correction, recorded, deps);
  if (first !== null) return first;
  const second = await askRevise(s, facts, draft, correction, recorded, deps);
  if (second !== null) return second;
  // A failed revise keeps the brief under correction. The recorded answers must not replace it.
  return draft;
}

async function askDraft(
  s: GuideSession,
  facts: Facts,
  recorded: SiteBrief,
  deps: { think: typeof think },
): Promise<SiteBrief | null> {
  try {
    const result = await deps.think(
      {
        task: BRIEF_DRAFT_TASK,
        schema: BRIEF_DRAFT_SCHEMA,
        model: INTERVIEW_MODEL,
        effort: "xhigh",
        maxTurns: BRIEF_DRAFT_MAX_TURNS,
        input: [
          "Draft the Site Brief from these recorded fields.",
          "Keep a recorded answer. Write prose only around those facts.",
          "Do not invent testimonials, awards, or numbers.",
          "Do not replace a recorded field with an empty line.",
          `Reply language: ${s.language}`,
          renderFacts(facts),
          "Recorded fields:",
          renderSiteBrief(recorded),
        ].join("\n"),
      },
      { projectDir: s.projectDir },
    );
    const brief = asBrief(result.value, true);
    if (brief === null) return null;
    if (briefIssues(brief, facts, s.language, recorded).length > 0) return null;
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
  recorded: SiteBrief,
  deps: { think: typeof think },
): Promise<SiteBrief | null> {
  try {
    const result = await deps.think(
      {
        task: BRIEF_REVISE_TASK,
        schema: BRIEF_REVISE_SCHEMA,
        model: INTERVIEW_MODEL,
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
    if (briefIssues(merged, facts, s.language, recorded).length > 0) return null;
    return merged;
  } catch {
    return null;
  }
}

function briefIssues(brief: SiteBrief, facts: Facts, language: string, recorded?: SiteBrief): string[] {
  const issues: string[] = [];
  for (const key of BRIEF_KEYS) {
    // A recorded answer is the person's words. It must not veto a correction to another field.
    if (recorded !== undefined && brief[key] === recorded[key]) continue;
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
    pages: "",
    features: "",
    coverage: "",
  };
}

export function deterministicBrief(facts: Facts, _language: string): SiteBrief {
  const byId = new Map<string, string>();
  for (const answer of facts.answers) byId.set(answer.id, answer.value);
  const brief = emptyBrief();
  for (const key of BRIEF_KEYS) brief[key] = safeField(recordedText(key, byId));
  brief.coverage = safeField("The interview file holds the coverage.");
  return brief;
}

function recordedText(key: BriefKey, byId: ReadonlyMap<string, string>): string {
  const ids = BRIEF_SOURCES[key];
  const primary = BRIEF_ANSWER_IDS[key];
  const ordered =
    primary !== undefined && ids.includes(primary) ? [primary, ...ids.filter((id) => id !== primary)] : [...ids];
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const id of ordered) {
    const value = (byId.get(id) ?? "").trim();
    if (value === "" || seen.has(value)) continue;
    seen.add(value);
    parts.push(value);
  }
  return parts.join(" ");
}

/**
 * A recorded answer fills a field the model left empty or "not stated yet".
 * Other prose stays, including a correction that does not repeat the original answer.
 */
function lockRecorded(model: SiteBrief, recorded: SiteBrief): SiteBrief {
  const next = { ...model };
  for (const key of BRIEF_KEYS) {
    const fact = recorded[key];
    if (key === "coverage") {
      next.coverage = fact;
      continue;
    }
    const prose = next[key].trim();
    if (fact !== UNSTATED) {
      if (prose === "" || prose === UNSTATED || prose.includes("not stated yet")) {
        next[key] = fact;
      }
    } else if (prose === "") {
      next[key] = UNSTATED;
    }
  }
  return next;
}

function safeField(raw: string): string {
  let text = raw.trim();
  if (text.startsWith("ASSUMED:")) text = text.slice("ASSUMED:".length).trim();
  if (text.startsWith("SOFT:")) text = text.slice("SOFT:".length).trim();
  text = stripUnsafe(text);
  return text === "" ? UNSTATED : text;
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
    lines.push(`## ${BRIEF_HEADINGS[key]}`, "", draft[key], "");
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
