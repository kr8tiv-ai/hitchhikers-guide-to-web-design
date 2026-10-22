import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BILLING_TOP_UP, isBillingFailure } from "../ai/grok-failure.ts";
import { shortenAtBoundary, type think } from "../ai/think.ts";
import { bindPacket, syncAnswer, writePhaseAdvisories } from "../context/index.ts";
import type { PacketOptions } from "../context/packet.ts";
import {
  BRIEF_DRAFT_SCHEMA,
  BRIEF_DRAFT_TASK,
  BRIEF_KEYS,
  BRIEF_LIST_MAX,
  BRIEF_OPTIONAL_KEYS,
  BRIEF_PROSE_MAX,
  BRIEF_REVISE_SCHEMA,
  BRIEF_REVISE_TASK,
  briefFieldDescription,
  briefFieldTarget,
  type BriefKey,
  type Facts,
  type SiteBrief,
} from "./schemas.ts";
import { INTERVIEW_MODEL } from "./interview-call.ts";
import { budgetCardCopy } from "./session-state.ts";
import { spaceAfterTerminal } from "./sentence-space.ts";
import { loadFacts } from "./suggest.ts";
import { interviewTreeFile } from "../packaged-dir.ts";
import { loadTree } from "../tree.ts";
import { briefTextIssues } from "./validators.ts";
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
  maintainer: "Maintainer",
  pages: "Pages",
  features: "Features",
  cadence: "Cadence",
  languages: "Languages",
  imagery: "Imagery",
  budget: "Budget",
  session: "Session",
  logo: "Logo",
  palette: "Colours",
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
  maintainer: ["DP-9.3"],
  pages: ["DP-2.8"],
  features: ["DP-3.7"],
  cadence: ["DP-3.5", "DP-8.3"],
  languages: ["DP-3.9"],
  imagery: ["DP-7.3", "DP-7.1", "DP-5.6", "DP-3.6"],
  budget: ["DP-7.2"],
  session: ["DP-0.5", "DP-0.7", "DP-0.1"],
  logo: ["DP-1.1", "DP-0.4"],
  palette: ["DP-1.2"],
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
  maintainer: "DP-9.3",
  pages: "DP-2.8",
  features: "DP-3.7",
  cadence: "DP-3.5",
  languages: "DP-3.9",
  imagery: "DP-7.3",
  budget: "DP-7.2",
  session: "DP-0.5",
  logo: "DP-1.1",
  palette: "DP-1.2",
};

/** One structured reply. Enough for the schema, not an open-ended agent loop. */
export const BRIEF_DRAFT_MAX_TURNS = 4;

/** Token budget for the brief packet. Decisions stay; recent rows trim first. */
export const BRIEF_DRAFT_BUDGET = 1200;

export const BRIEF_DRAFT_ERROR =
  "The brief draft stopped early. These fields stay filled from the interview. Use Retry to ask again.";

const UNSTATED = "The field is not stated yet.";

/** Keys a stub may omit. The recorded answer fills them. The schema still requires them. */
const FILLED_WHEN_MISSING: ReadonlySet<BriefKey> = BRIEF_OPTIONAL_KEYS;

const MOTION_LABELS = [
  "",
  "calm brochure",
  "gentle",
  "polished",
  "editorial",
  "expressive",
  "cinematic lite",
  "cinematic",
  "a 3D accent",
  "3D-led",
  "a world",
];

const CADENCE_SKIP = "No blog cadence.";

const SKIPPED_STATUS = new Set(["SKIPPED", "NOT_APPLICABLE", "UNANSWERED"]);

const BRIEF_PACKET: PacketOptions = { budgetTokens: BRIEF_DRAFT_BUDGET };

export interface BriefStep {
  draft: SiteBrief;
  approved: boolean;
  error: string;
  /** True while the fields are the interview fallback, not a model draft. */
  fallback: boolean;
}

export async function* briefLoop(
  s: GuideSession,
  deps: { think: typeof think; priorError?: string; held?: BriefStep },
): AsyncGenerator<BriefStep> {
  const facts = loadFacts(s.projectDir);
  const bound = { think: bindPacket(deps.think, s.projectDir, "brief", BRIEF_PACKET) };
  let draft: SiteBrief;
  let error: string;
  let fallback: boolean;
  if (deps.held !== undefined) {
    draft = deps.held.draft;
    error = deps.held.error;
    fallback = deps.held.fallback;
  } else {
    const drafted = await draftOrFallback(s, facts, bound, deps.priorError ?? "");
    draft = drafted.brief;
    error = drafted.error;
    fallback = drafted.fallback;
  }
  let note: unknown = yield { draft, approved: false, error, fallback };
  while (!isApproval(typeof note === "string" ? note : "")) {
    const correction = typeof note === "string" ? note : "";
    draft = await reviseOrFallback(s, facts, draft, correction, bound);
    note = yield { draft, approved: false, error, fallback };
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
  yield { draft, approved: true, error: "", fallback: false };
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
  priorError: string,
): Promise<{ brief: SiteBrief; error: string; fallback: boolean }> {
  const recorded = deterministicBrief(facts, s.language);
  const first = await askDraft(s, facts, recorded, deps, priorError);
  if (first.brief !== null) {
    return { brief: routeLimits(shapeBrief(lockRecorded(first.brief, recorded), facts, recorded), facts), error: "", fallback: false };
  }
  if (first.reason === BILLING_TOP_UP) return { brief: routeLimits(recorded, facts), error: BILLING_TOP_UP, fallback: true };
  const second = await askDraft(s, facts, recorded, deps, joinPrior(priorError, first.reason));
  if (second.brief !== null) {
    return { brief: routeLimits(shapeBrief(lockRecorded(second.brief, recorded), facts, recorded), facts), error: "", fallback: false };
  }
  if (priorError.trim() !== "") return { brief: routeLimits(recorded, facts), error: retryFailure(second.reason), fallback: true };
  if (first.rejected || second.rejected) return { brief: routeLimits(recorded, facts), error: rejectedDraftCopy(second.reason), fallback: true };
  return { brief: routeLimits(recorded, facts), error: BRIEF_DRAFT_ERROR, fallback: true };
}

function rejectedDraftCopy(reason: string): string {
  const detail = reason.trim() === "" ? "The draft did not pass." : reason.trim();
  return `The brief draft was not used. ${detail} These fields stay filled from the interview. Use Retry to ask again.`;
}

function joinPrior(prior: string, reason: string): string {
  return [prior.trim(), reason.trim()].filter((part) => part !== "").join(" ");
}

function retryFailure(reason: string): string {
  const when = new Date().toISOString();
  const detail = stripUnsafe(reason).replace(/\s+/g, " ").trim().slice(0, 280);
  const what = detail === "" ? "The draft did not pass." : detail;
  return `The brief draft failed again at ${when}. ${what} Use Retry to ask again.`;
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
  if (first !== null) return applyNamedEdits(first, correction);
  const second = await askRevise(s, facts, draft, correction, recorded, deps);
  if (second !== null) return applyNamedEdits(second, correction);
  // A failed revise keeps the brief under correction. The recorded answers must not replace it.
  return applyNamedEdits(draft, correction);
}

/** "Budget: ..." writes that field. Other prose stays with the model. */
function applyNamedEdits(draft: SiteBrief, correction: string): SiteBrief {
  const edits = namedBriefEdits(correction);
  const next = { ...draft };
  for (const key of BRIEF_KEYS) {
    const value = edits[key];
    if (value === undefined) continue;
    const capped = shortenAtBoundary(value, briefFieldTarget(key));
    if (capped.trim() !== "") next[key] = capped.trim();
  }
  return next;
}

function namedBriefEdits(correction: string): Partial<SiteBrief> {
  const text = correction.trim();
  if (text === "") return {};
  const labels = BRIEF_KEYS.map((key) => ({ key, label: BRIEF_HEADINGS[key] })).sort(
    (left, right) => right.label.length - left.label.length,
  );
  const hits: { key: BriefKey; at: number; len: number }[] = [];
  const lower = text.toLowerCase();
  for (const item of labels) {
    const needle = `${item.label.toLowerCase()}:`;
    let from = 0;
    while (from < lower.length) {
      const at = lower.indexOf(needle, from);
      if (at < 0) break;
      const before = at === 0 ? "" : (lower[at - 1] ?? "");
      if (at === 0 || before === " " || before === "\n" || before === "\t") {
        hits.push({ key: item.key, at, len: needle.length });
      }
      from = at + needle.length;
    }
  }
  hits.sort((left, right) => left.at - right.at);
  const edits: Partial<SiteBrief> = {};
  for (let index = 0; index < hits.length; index += 1) {
    const hit = hits[index];
    if (hit === undefined || edits[hit.key] !== undefined) continue;
    const next = hits.slice(index + 1).find((item) => item.at > hit.at);
    const end = next === undefined ? text.length : next.at;
    const value = stripUnsafe(text.slice(hit.at + hit.len, end)).replace(/[;,]\s*$/, "").trim();
    if (value !== "") edits[hit.key] = value;
  }
  return edits;
}

interface DraftAttempt {
  brief: SiteBrief | null;
  reason: string;
  /** True when the call returned a draft and the brief checks refused it. */
  rejected: boolean;
}

async function askDraft(
  s: GuideSession,
  facts: Facts,
  recorded: SiteBrief,
  deps: { think: typeof think },
  priorError: string,
): Promise<DraftAttempt> {
  try {
    const lines = [
      "Draft the Site Brief from these recorded fields.",
      "Keep a recorded answer. Write prose only around those facts.",
      "Do not invent testimonials, awards, or numbers.",
      "Do not replace a recorded field with an empty line.",
      `Prose fields are at most ${BRIEF_PROSE_MAX} characters. ${briefFieldDescription("goal")}`,
      `The fields pages, features, limits, references, and cadence are at most ${BRIEF_LIST_MAX} characters. ${briefFieldDescription("pages")}`,
      renderAnswerMap(),
      `Reply language: ${s.language}`,
    ];
    if (priorError.trim() !== "") {
      lines.push(`The last draft failed: ${priorError.trim()}`, "Fix that and return the full brief.");
    }
    lines.push(renderFacts(facts), "Recorded fields:", renderSiteBrief(recorded));
    const result = await deps.think(
      {
        task: BRIEF_DRAFT_TASK,
        schema: BRIEF_DRAFT_SCHEMA,
        model: INTERVIEW_MODEL,
        effort: "xhigh",
        maxTurns: BRIEF_DRAFT_MAX_TURNS,
        input: lines.join("\n"),
      },
      { projectDir: s.projectDir },
    );
    const brief = asBrief(result.value, true);
    if (brief === null) {
      await logRejection(s, "brief-draft", "schema: The draft did not match the brief.");
      return { brief: null, reason: "The draft did not match the brief.", rejected: true };
    }
    const issues = briefIssues(brief, facts, s.language, recorded);
    if (issues.length > 0) {
      await logRejection(s, "brief-draft", formatIssueLog(issues));
      return { brief: null, reason: formatIssueCopy(issues), rejected: true };
    }
    return { brief, reason: "", rejected: false };
  } catch (error) {
    if (isBillingFailure(error)) return { brief: null, reason: BILLING_TOP_UP, rejected: false };
    const reason = error instanceof Error && error.message.trim() !== "" ? error.message : "The draft did not pass.";
    return { brief: null, reason, rejected: false };
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
          `Prose fields are at most ${BRIEF_PROSE_MAX} characters. ${briefFieldDescription("goal")}`,
          `The fields pages, features, limits, references, and cadence are at most ${BRIEF_LIST_MAX} characters. ${briefFieldDescription("pages")}`,
          renderAnswerMap(),
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
    if (partial === null) {
      await logRejection(s, "brief-revise", "merge: The revision did not match the brief.");
      return null;
    }
    const merged = mergeBrief(draft, partial);
    const issues = briefIssues(merged, facts, s.language, recorded);
    if (issues.length > 0) {
      await logRejection(s, "brief-revise", formatIssueLog(issues));
      return null;
    }
    return shapeBrief(merged, facts, recorded);
  } catch (error) {
    if (isBillingFailure(error)) throw error;
    return null;
  }
}

interface FieldIssue {
  key: BriefKey;
  rule: string;
}

function briefIssues(brief: SiteBrief, facts: Facts, language: string, recorded?: SiteBrief): FieldIssue[] {
  const issues: FieldIssue[] = [];
  for (const key of BRIEF_KEYS) {
    // A recorded answer is the person's words. It must not veto a correction to another field.
    if (recorded !== undefined && brief[key] === recorded[key]) continue;
    for (const rule of briefTextIssues(brief[key], { language, facts })) issues.push({ key, rule });
  }
  return issues;
}

function formatIssueLog(issues: readonly FieldIssue[]): string {
  return issues.map((issue) => `${issue.key}: ${issue.rule}`).join("; ");
}

function formatIssueCopy(issues: readonly FieldIssue[]): string {
  const groups = new Map<string, BriefKey[]>();
  for (const issue of issues) {
    const list = groups.get(issue.rule) ?? [];
    if (!list.includes(issue.key)) list.push(issue.key);
    groups.set(issue.rule, list);
  }
  const sentences: string[] = [];
  for (const [rule, keys] of groups) sentences.push(ruleSentence(rule, keys));
  return sentences.join(" ");
}

function joinHeadings(keys: readonly BriefKey[]): string {
  const names = keys.map((key) => BRIEF_HEADINGS[key]);
  if (names.length <= 1) return names[0] ?? "A field";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function ruleSentence(rule: string, keys: readonly BriefKey[]): string {
  const names = joinHeadings(keys);
  const plural = keys.length !== 1;
  if (rule === "language") return `${names} ${plural ? "are" : "is"} not in the reply language.`;
  if (rule === "exclamation") return `${names} ${plural ? "have" : "has"} an exclamation mark.`;
  if (rule === "em-dash") return `${names} ${plural ? "have" : "has"} an em dash.`;
  if (rule.startsWith("banned:")) return `${names} ${plural ? "use" : "uses"} "${rule.slice("banned:".length)}".`;
  if (rule.startsWith("claim:number:")) {
    return `${names} ${plural ? "cite" : "cites"} ${rule.slice("claim:number:".length)}, which is not in the interview.`;
  }
  if (rule.startsWith("claim:")) return `${names} ${plural ? "add" : "adds"} a claim that is not in the interview.`;
  return `${names} did not pass the ${rule} check.`;
}

async function logRejection(s: GuideSession, task: string, error: string): Promise<void> {
  const { appendAiOutcome } = await import("../ai/think.ts");
  await appendAiOutcome(s.projectDir, {
    task,
    outcome: "rejected",
    error,
    model: INTERVIEW_MODEL,
    effort: "xhigh",
  });
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
    if (typeof field !== "string" || field.trim() === "") {
      if (FILLED_WHEN_MISSING.has(key)) {
        brief[key] = UNSTATED;
        continue;
      }
      return null;
    }
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
    maintainer: "",
    pages: "",
    features: "",
    cadence: "",
    languages: "",
    imagery: "",
    budget: "",
    session: "",
    logo: "",
    palette: "",
    coverage: "",
  };
}

export function deterministicBrief(facts: Facts, _language: string): SiteBrief {
  const recorded = emptyBrief();
  for (const key of BRIEF_KEYS) recorded[key] = safeField(recordedField(key, facts).text);
  applyLimitRouting(recorded, facts);
  return routeLimits(shapeBrief(recorded, facts, recorded), facts);
}

/** The desk path and the fallback both end here, so a model draft cannot put the timeline back into Limits. */
function routeLimits(brief: SiteBrief, facts: Facts): SiteBrief {
  applyLimitRouting(brief, facts);
  for (const key of BRIEF_KEYS) brief[key] = spaceAfterTerminal(brief[key]);
  return brief;
}

/**
 * Timeline belongs in Timeline. Office hours and a program fact are not limits.
 * Filler confirmations are dropped. Limits keep constraints and never-dos.
 */
function applyLimitRouting(brief: SiteBrief, facts: Facts): void {
  const byId = new Map<string, string>();
  for (const answer of facts.answers) {
    if (SKIPPED_STATUS.has(answer.status ?? "")) continue;
    byId.set(answer.id, answer.value);
  }
  const limits: string[] = [];
  const timeline: string[] = [];
  const factsOut: string[] = [];
  for (const id of ["DP-8.4", "DP-9.1", "DP-9.5"]) {
    const cleaned = cleanAnswer(id, byId.get(id) ?? "");
    if (cleaned === "") continue;
    for (const sentence of splitSentences(cleaned)) {
      let text = sentence.trim().replace(/^yes[,:]?\s+/i, "").trim();
      if (text === "" || isFillerSentence(text)) continue;
      if (isTimelineSentence(text)) timeline.push(ensureSentence(text));
      else if (isContentFact(text)) factsOut.push(capitalizeSentence(ensureSentence(text)));
      else limits.push(capitalizeSentence(ensureSentence(text)));
    }
  }
  if (limits.length > 0) brief.limits = safeField(joinSentences(limits));
  if (timeline.length > 0) {
    const sentence = joinSentences(timeline);
    const base = brief.cadence === UNSTATED ? "" : brief.cadence;
    const already = base.toLowerCase().includes(sentence.replace(/\.$/, "").toLowerCase());
    if (!already) {
      const line = `Timeline: ${sentence}`;
      brief.cadence = safeField(joinSentences([base, line].filter((part) => part.trim() !== "")));
    }
  }
  if (factsOut.length > 0) {
    const base = brief.session === UNSTATED ? "" : brief.session;
    const missing = factsOut.filter((fact) => !base.toLowerCase().includes(fact.replace(/\.$/, "").toLowerCase()));
    if (missing.length > 0) {
      brief.session = safeField(joinSentences([base, ...missing].filter((part) => part.trim() !== "")));
    }
  }
}

function isFillerSentence(text: string): boolean {
  const bare = text.replace(/[.?!]+$/g, "").trim().replaceAll("\u2019", "'");
  return /^(yes(, that is right)?|yeah|ok|okay|that is right|that's right|thats right|correct|right)$/i.test(bare);
}

function isTimelineSentence(text: string): boolean {
  return /\bin \d+ weeks\b/i.test(text) || /\bby [a-z]+ \d{1,2}, \d{4}\b/i.test(text) || /\btimeline\b/i.test(text);
}

function isContentFact(text: string): boolean {
  if (/\bnever\b/i.test(text) || /\bdisclaimer\b/i.test(text)) return false;
  return /\boffice hours\b/i.test(text) || /\bcaretaker program\b/i.test(text);
}

function ensureSentence(text: string): string {
  const trimmed = text.trim();
  if (trimmed === "") return "";
  return /[.?!]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function joinSentences(parts: readonly string[]): string {
  const text = parts
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .join(" ");
  return spaceAfterTerminal(text);
}

/** One DP id, one field. The draft prompt and the fallback both read this table. */
export function renderAnswerMap(): string {
  const lines = ["Each answer feeds one field. Do not copy an answer into a second field."];
  for (const key of BRIEF_KEYS) {
    for (const id of BRIEF_SOURCES[key]) lines.push(`${id}: ${key}`);
  }
  lines.push("Coverage lists covered and uncovered question ids. It does not copy answer text.");
  return lines.join("\n");
}

/** Cleaned text for one field, and every answer id that contributed. */
export function recordedField(
  key: BriefKey,
  facts: Facts,
): { text: string; sourceIds: readonly string[] } {
  if (key === "coverage") return { text: coverageLine(facts), sourceIds: [] };
  const byId = new Map<string, string>();
  for (const answer of facts.answers) byId.set(answer.id, answer.value);
  const ids = BRIEF_SOURCES[key];
  const primary = BRIEF_ANSWER_IDS[key];
  const ordered =
    primary !== undefined && ids.includes(primary) ? [primary, ...ids.filter((id) => id !== primary)] : [...ids];
  const parts: string[] = [];
  const sourceIds: string[] = [];
  const seen = new Set<string>();
  let skipped = "";
  let skippedId = "";
  for (const id of ordered) {
    const cleaned = spaceAfterTerminal(cleanAnswer(id, byId.get(id) ?? ""));
    // A timeline or filler answer still names its question, so Change this answer can open it.
    const value = key === "limits" ? limitsSourceText(cleaned) : cleaned;
    if (key === "limits" && cleaned !== "") sourceIds.push(id);
    if (value === "" || seen.has(value)) continue;
    if (key === "cadence" && value === CADENCE_SKIP) {
      skipped = value;
      skippedId = id;
      continue;
    }
    seen.add(value);
    parts.push(value);
    if (key !== "limits") sourceIds.push(id);
  }
  if (parts.length === 0 && skipped !== "") {
    parts.push(skipped);
    sourceIds.push(skippedId);
  }
  let text = spaceAfterTerminal(parts.join(" "));
  if (key === "budget") text = budgetCardCopy(text, byId.get("DP-6.4") ?? "");
  return { text: spaceAfterTerminal(text), sourceIds };
}

/** The Limits source line keeps constraints. Timeline, filler, and program facts leave it. */
function limitsSourceText(value: string): string {
  const kept: string[] = [];
  for (const sentence of splitSentences(value)) {
    const text = sentence.trim().replace(/^yes[,:]?\s+/i, "").trim();
    if (text === "" || isFillerSentence(text) || isFillerSentence(sentence)) continue;
    if (isTimelineSentence(text) || isTimelineSentence(sentence)) continue;
    if (isContentFact(text)) continue;
    kept.push(sentence.trim());
  }
  return joinSentences(kept);
}

let defaultSurfaceIds: Set<string> | null = null;

/** Questions the desk never asks. DP-6.5 is the stored default that made the count 62. */
function hiddenQuestionIds(): Set<string> {
  if (defaultSurfaceIds !== null) return defaultSurfaceIds;
  defaultSurfaceIds = new Set();
  try {
    const file = interviewTreeFile();
    for (const question of loadTree(file)) {
      if (question.surface === "default") defaultSurfaceIds.add(question.id);
    }
  } catch {
    // A missing tree leaves every stored answer in the count.
  }
  return defaultSurfaceIds;
}

function coverageLine(facts: Facts): string {
  const hidden = hiddenQuestionIds();
  const covered: string[] = [];
  const uncovered: string[] = [];
  const seen = new Set<string>();
  for (const answer of facts.answers) {
    if (hidden.has(answer.id) || seen.has(answer.id)) continue;
    seen.add(answer.id);
    if (SKIPPED_STATUS.has(answer.status ?? "")) uncovered.push(answer.id);
    else if (answer.value.trim() !== "") covered.push(answer.id);
  }
  const parts: string[] = [];
  if (uncovered.length > 0) parts.push(`Uncovered: ${uncovered.join(", ")}.`);
  if (covered.length > 0) parts.push(`Covered: ${covered.join(", ")}.`);
  const line = parts.join(" ");
  const max = briefFieldTarget("coverage");
  if (line.length <= max) return line;
  return summarizeCoverage(covered, uncovered, max);
}

/** A complete count. Never a list that stops in the middle of an id. */
function summarizeCoverage(covered: readonly string[], uncovered: readonly string[], max: number): string {
  const total = covered.length + uncovered.length;
  const head = `Covered ${covered.length} of ${total} answers.`;
  const listed = uncovered.length === 0 ? head : `${head} Uncovered: ${uncovered.join(", ")}.`;
  if (listed.length <= max) return listed;
  const counts = uncovered.length === 0 ? head : `${head} Uncovered ${uncovered.length} of ${total}.`;
  if (counts.length <= max) return counts;
  return head;
}

function cleanAnswer(id: string, value: string): string {
  let text = value.trim();
  text = text.replace(/^yes, that is right\.\s*/i, "");
  text = text.replace(/^also:\s*/i, "");
  text = text.trim();
  if (id !== "DP-6.2") return text;
  const match = /^(\d{1,2})\.?$/.exec(text);
  if (match === null) return text;
  const score = Number(match[1]);
  if (!Number.isInteger(score) || score < 1 || score > 10) return text;
  const label = MOTION_LABELS[score] ?? "";
  return label === "" ? `${score} of 10` : `${score} of 10, ${label}`;
}

/**
 * Drop a repeated phrase inside one field, then a sentence copied from another field's answer.
 * Shorten to the field target. An empty result falls back to the recorded line.
 */
function shapeBrief(brief: SiteBrief, facts: Facts, recorded: SiteBrief): SiteBrief {
  const next = { ...brief };
  for (const key of BRIEF_KEYS) {
    let text = dedupePhrases(next[key]);
    text = stripForeignSentences(text, key, facts);
    if (text.trim() === "") text = recorded[key];
    text = shortenAtBoundary(text, briefFieldTarget(key));
    text = restoreListed(key, text, recorded[key]);
    next[key] = text.trim() === "" ? UNSTATED : text.trim();
  }
  const shaped = dedupeAcross(next);
  shaped.vibe = settleVibe(shaped.vibe, recorded.vibe);
  return shaped;
}

function feelNeverList(raw: string): string[] {
  return raw
    .split(/,|\/|\band\b/i)
    .map((part) => {
      const text = part.replace(/[.]+$/, "").trim().replace(/^(?:or|and)\s+/i, "").trim();
      return text;
    })
    .filter((part) => part !== "");
}

function oxfordJoin(words: readonly string[], conjunction = "and"): string {
  if (words.length === 0) return "";
  if (words.length === 1) return words[0] ?? "";
  if (words.length === 2) return `${words[0]} ${conjunction} ${words[1]}`;
  return `${words.slice(0, -1).join(", ")}, ${conjunction} ${words[words.length - 1]}`;
}

function capitalizeSentence(text: string): string {
  if (text === "") return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Feel and Never become whole sentences. An empty slot is left out,
 * so a line never starts with "is the test".
 * Returns null when the text is not that pair of slots.
 */
export function vibeProse(raw: string): string | null {
  if (!/Feel:|Never:/i.test(raw)) return null;
  const feel = /Feel:\s*([^.]*)/i.exec(raw);
  const never = /Never:\s*([^.]*)/i.exec(raw);
  const feelWords = feel === null ? [] : feelNeverList(feel[1] ?? "");
  const neverWords = never === null ? [] : feelNeverList(never[1] ?? "");
  const sentences: string[] = [];
  if (feelWords.length > 0) {
    sentences.push(`${capitalizeSentence(oxfordJoin(feelWords))} is the test for the words, the space, and the photos.`);
  }
  if (neverWords.length > 0) {
    sentences.push(`It should never feel ${oxfordJoin(neverWords, "or")}.`);
  }
  const safe = sentences.filter((sentence) => !/^(is|are|was|were)\b/i.test(sentence.trim()));
  return safe.join(" ");
}

function dropEmptySlotSentences(text: string): string {
  const kept = splitSentences(text).filter((sentence) => !/^(is|are|was|were)\b/i.test(sentence.trim()));
  return tidy(kept.join(" "));
}

function settleVibe(draft: string, recorded: string): string {
  const fromDraft = vibeProse(draft);
  if (fromDraft !== null) return fromDraft === "" ? UNSTATED : fromDraft;
  const broken = /^\s*(is|are|was|were)\b/i.test(draft.trim()) || /\.\s+(is|are|was|were)\b/i.test(draft);
  const fromRecorded = vibeProse(recorded);
  if (broken && fromRecorded !== null && fromRecorded !== "") return fromRecorded;
  const cleaned = dropEmptySlotSentences(draft);
  return cleaned.trim() === "" ? UNSTATED : cleaned;
}

const LIST_RESTORE = new Set<BriefKey>(["pages", "features", "limits", "references", "cadence"]);

/**
 * A boundary cut that is only a prefix of the recorded list is put back, when the list fits the cap.
 * A repeated phrase that dedupe already dropped stays dropped.
 */
function restoreListed(key: BriefKey, text: string, recorded: string): string {
  if (!LIST_RESTORE.has(key)) return text;
  const fact = recorded.trim();
  const prose = text.trim();
  if (fact === "" || fact === UNSTATED) return text;
  const cleaned = dedupePhrases(fact).trim();
  const goal = cleaned === "" ? fact : cleaned;
  if (goal.length > briefFieldTarget(key)) return text;
  if (prose.length < goal.length && goal.startsWith(prose)) return goal;
  return text;
}

function dedupeAcross(brief: SiteBrief): SiteBrief {
  const seen = new Set<string>();
  const next = { ...brief };
  for (const key of BRIEF_KEYS) {
    const parts = splitSentences(next[key]);
    const fresh = parts.filter((part) => {
      const norm = normalizeSentence(part);
      return norm.split(" ").length < 4 || !seen.has(norm);
    });
    const kept = fresh.length === 0 ? parts : fresh;
    for (const part of kept) {
      const norm = normalizeSentence(part);
      if (norm.split(" ").length >= 4) seen.add(norm);
    }
    const text = tidy(kept.join(" "));
    if (text !== "") next[key] = text;
  }
  return next;
}

function stripForeignSentences(text: string, key: BriefKey, facts: Facts): string {
  const foreign = foreignSentences(key, facts);
  if (foreign.length === 0) return text;
  const kept: string[] = [];
  for (const sentence of splitSentences(text)) {
    const norm = normalizeSentence(sentence);
    let blocked = false;
    for (const phrase of foreign) {
      if (norm === phrase || norm.includes(phrase)) {
        blocked = true;
        break;
      }
    }
    if (!blocked) kept.push(sentence);
  }
  if (kept.length === 0) return "";
  return tidy(kept.join(" "));
}

function foreignSentences(key: BriefKey, facts: Facts): string[] {
  const owned = new Set<string>(BRIEF_SOURCES[key]);
  const phrases: string[] = [];
  for (const answer of facts.answers) {
    if (owned.has(answer.id)) continue;
    const cleaned = cleanAnswer(answer.id, answer.value);
    for (const sentence of splitSentences(cleaned)) {
      const norm = normalizeSentence(sentence);
      if (norm.split(" ").length >= 4) phrases.push(norm);
    }
  }
  return phrases;
}

function dedupePhrases(text: string): string {
  let words = wordParts(text);
  for (let guard = 0; guard < 24; guard += 1) {
    const found = findRepeat(words);
    if (found === null) break;
    words = words.slice(0, found.at).concat(words.slice(found.at + found.len));
  }
  return tidy(words.join(" "));
}

function findRepeat(words: readonly string[]): { at: number; len: number } | null {
  const max = Math.min(18, words.length);
  for (let len = max; len >= 4; len -= 1) {
    for (let start = 0; start + len <= words.length; start += 1) {
      const window = words.slice(start, start + len);
      for (let at = start + len; at + len <= words.length; at += 1) {
        if (sameWords(window, words.slice(at, at + len))) return { at, len };
      }
    }
  }
  return null;
}

function sameWords(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (normalizeWord(left[index] ?? "") !== normalizeWord(right[index] ?? "")) return false;
  }
  return true;
}

function splitSentences(text: string): string[] {
  const parts: string[] = [];
  let current = "";
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index] ?? "";
    current += ch;
    const next = text[index + 1];
    if ((ch === "." || ch === "?" || ch === ";") && (next === undefined || next === " ")) {
      const trimmed = current.trim();
      if (trimmed !== "") parts.push(trimmed);
      current = "";
    }
  }
  const tail = current.trim();
  if (tail !== "") parts.push(tail);
  return parts;
}

function normalizeSentence(text: string): string {
  return wordParts(text)
    .map((word) => normalizeWord(word))
    .filter((word) => word !== "")
    .join(" ");
}

function normalizeWord(word: string): string {
  let out = "";
  for (const ch of word.toLowerCase()) {
    const code = ch.codePointAt(0) ?? 0;
    const keep =
      (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || ch === "'" || ch === "-";
    if (keep) out += ch;
  }
  return out;
}

function wordParts(text: string): string[] {
  const parts: string[] = [];
  let current = "";
  for (const ch of text) {
    if (ch === " " || ch === "\n" || ch === "\t") {
      if (current !== "") parts.push(current);
      current = "";
    } else current += ch;
  }
  if (current !== "") parts.push(current);
  return parts;
}

function tidy(text: string): string {
  let out = text.replace(/\s+/g, " ").trim();
  out = out.replace(/\s+([,.;:?])/g, "$1");
  out = out.replace(/:\s*\./g, ".");
  out = out.replace(/\s+/g, " ").trim();
  return out;
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
  text = spaceAfterTerminal(text);
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
    if (key === "cadence") {
      const split = splitTimeline(draft.cadence);
      lines.push(`## ${BRIEF_HEADINGS[key]}`, "", split.body, "");
      if (split.timeline !== "") lines.push("## Timeline", "", split.timeline, "");
      continue;
    }
    lines.push(`## ${BRIEF_HEADINGS[key]}`, "", spaceAfterTerminal(draft[key]), "");
  }
  return lines.join("\n");
}

function splitTimeline(text: string): { body: string; timeline: string } {
  const match = /(?:^|\s)Timeline:\s*([\s\S]+)$/.exec(text);
  if (match === null || match.index === undefined) return { body: text, timeline: "" };
  const body = text.slice(0, match.index).trim();
  return { body: body === "" ? UNSTATED : body, timeline: (match[1] ?? "").trim() };
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
